const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const inventoryService = require("../src/services/inventory/inventory.service");
const { models } = require("../src/models");

const t1 = { LOCK: { UPDATE: "UPDATE" } };
const row = (data) => ({ ...data, toJSON() { const { toJSON, ...plain } = this; return plain; } });

// In-memory inventories, master items and histories (DB1 only).
function mockStore(t, inventories = []) {
  const db = models.db1;
  const store = {
    masters: [{ id: 1, item_code: "LTP" }, { id: 2, item_code: "ATK" }],
    inventories: inventories.map(row),
    histories: [],
    masterLocks: [],
    codeQueries: [],
  };
  const matches = (inv, cond) => {
    if (cond[Op.or]) return cond[Op.or].some((option) => matches(inv, option));
    if (cond[Op.and]) return cond[Op.and].every((option) => matches(inv, option));
    return Object.entries(cond).every(([key, value]) => (inv[key] ?? null) === value);
  };
  const replace = [
    [db.MasterItem, "findByPk", async (id, options) => {
      store.masterLocks.push(options.lock);
      return store.masters.find((master) => master.id === Number(id)) || null;
    }],
    [db.Inventory, "findOne", async ({ where, order }) => {
      if (where.product_code) {
        store.codeQueries.push({ where, order });
        const prefix = where.product_code[Op.like].slice(0, -1);
        const codes = store.inventories.map((inv) => inv.product_code).filter((code) => code?.startsWith(prefix));
        codes.sort((a, b) => b.length - a.length || (a < b ? 1 : -1));
        return codes.length ? { product_code: codes[0] } : null;
      }
      return store.inventories.find((inv) => where[Op.and].every((cond) => matches(inv, cond))) || null;
    }],
    [db.Inventory, "update", async (data, { where }) => {
      Object.assign(store.inventories.find((inv) => inv.id === where.id), data);
      return [1];
    }],
    [db.Inventory, "create", async (data) => {
      const created = row({ id: store.inventories.length + 1, ...data });
      store.inventories.push(created);
      return created;
    }],
    [db.InventoryHistory, "create", async (data) => { store.histories.push(data); return data; }],
  ];
  const originals = replace.map(([target, key]) => [target, key, target[key]]);
  t.after(() => { for (const [target, key, value] of originals) target[key] = value; });
  for (const [target, key, value] of replace) target[key] = value;
  return store;
}

const laptop = { id_master_item: 1, item_name: "Laptop", brand: "Dell", model_number: "Latitude 5440",
  quantity_unit: "unit", id_company: 2, id_inventory_location: 4, received_date: "2026-11-20" };
const add = (source) => inventoryService.addStock(source, { note: "test" }, 5, t1);

test("Product codes count up per item code and pad to 5 digits", async (t) => {
  const store = mockStore(t, [
    { id: 1, product_code: "LTP-00009" }, { id: 2, product_code: "ATK-00042" }, { id: 3, product_code: null },
  ]);
  assert.equal(await inventoryService.nextProductCode(1, t1), "LTP-00010");
  assert.equal(await inventoryService.nextProductCode(2, t1), "ATK-00043");
  // The master row is locked so two receipts never get the same code.
  assert.deepEqual(store.masterLocks, ["UPDATE", "UPDATE"]);
  assert.deepEqual(store.codeQueries[0].where, { product_code: { [Op.like]: "LTP-%" } });
  // Longer codes sort first, so 100000 comes after 99999.
  assert.equal(store.codeQueries[0].order[0][1], "DESC");
  store.inventories.push(row({ id: 4, product_code: "LTP-99999" }));
  assert.equal(await inventoryService.nextProductCode(1, t1), "LTP-100000");
  store.inventories.push(row({ id: 5, product_code: "LTP-100000" }));
  assert.equal(await inventoryService.nextProductCode(1, t1), "LTP-100001");
  store.masters = [];
  await assert.rejects(inventoryService.nextProductCode(1, t1), /Master item 1 not found/);
});

test("Each serial number becomes its own row and code; units without one share a row", async (t) => {
  const store = mockStore(t);
  await add({ ...laptop, serial_number: "SN-A", quantity: 1 });
  await add({ ...laptop, serial_number: "SN-B", quantity: 1 });
  await add({ ...laptop, serial_number: null, quantity: 3 });
  await add({ ...laptop, serial_number: "", quantity: 2 });
  assert.deepEqual(store.inventories.map((inv) => [inv.product_code, inv.serial_number, inv.quantity]),
    [["LTP-00001", "SN-A", 1], ["LTP-00002", "SN-B", 1], ["LTP-00003", null, 5]]);
  assert.deepEqual(store.inventories.map((inv) => [inv.id_master_item, inv.model_number]),
    [[1, "Latitude 5440"], [1, "Latitude 5440"], [1, "Latitude 5440"]]);
  // A different model number is a different row.
  await add({ ...laptop, model_number: "Latitude 7440", quantity: 1 });
  assert.equal(store.inventories[3].product_code, "LTP-00004");
});

test("Master items match by id, not by name; rows without a master never get a code", async (t) => {
  const store = mockStore(t);
  await add({ ...laptop, quantity: 1 });
  // A renamed master still adds to the same row.
  await add({ ...laptop, item_name: "Laptop Kantor", quantity: 1 });
  // An old item without a master is its own row, matched by item_name, without a code.
  await add({ ...laptop, id_master_item: null, quantity: 2 });
  await add({ ...laptop, id_master_item: null, quantity: 1 });
  assert.deepEqual(store.inventories.map((inv) => [inv.id_master_item, inv.product_code, inv.quantity]),
    [[1, "LTP-00001", 2], [null, null, 3]]);
});

test("A moved row keeps its product code at the destination", async (t) => {
  const store = mockStore(t, [{ id: 1, ...laptop, product_code: "LTP-00007", serial_number: "SN-A", quantity: 0 }]);
  await add({ ...store.inventories[0].toJSON(), id_inventory_location: 9, quantity: 1 });
  assert.deepEqual([store.inventories[1].product_code, store.inventories[1].serial_number,
    store.inventories[1].id_inventory_location], ["LTP-00007", "SN-A", 9]);
  assert.equal(store.codeQueries.length, 0);
});

test("A goods receipt with serial numbers stocks each unit as its own coded row and links it", async (t) => {
  const store = mockStore(t, [{ id: 1, product_code: "LTP-00004" }]);
  const db = models.db1;
  const originals = [
    [db.GaPurchaseOrder, "findByPk"], [db.GaPurchaseOrderItem, "findOne"], [db.GaPurchaseOrderItemReceiptUnit, "update"],
  ].map(([target, key]) => [target, key, target[key]]);
  t.after(() => { for (const [target, key, value] of originals) target[key] = value; });
  db.GaPurchaseOrder.findByPk = async () => ({ id: 1, id_company: 2, company: { id: 2, id_inventory_location: 4 } });
  db.GaPurchaseOrderItem.findOne = async () => row({ id: 11, id_master_item: 1, item_name: "Laptop", brand: "Dell",
    model_number: "Latitude 5440", quantity_unit: "unit", asset_category: "asset", files_product: [] });
  const linked = [];
  db.GaPurchaseOrderItemReceiptUnit.update = async (data, { where }) => { linked.push([where.id, data.id_inventory]); return [1]; };

  const receipt = { id: 31, type: "accept", has_serial_number: true, quantity_received: 2, quantity_returned: 0,
    goods_in_date: "2026-11-20" };
  const ids = await inventoryService.addFromGaPurchaseOrderReceipt(1, 11, receipt, 5, t1, null,
    [{ id: 301, serial_number: "SN-1" }, { id: 302, serial_number: "SN-2" }]);
  assert.deepEqual(ids, [2, 3]);
  assert.deepEqual(store.inventories.slice(1).map((inv) => [inv.product_code, inv.serial_number, inv.quantity,
    inv.model_number, inv.id_company, inv.id_inventory_location, inv.received_date]), [
    ["LTP-00005", "SN-1", 1, "Latitude 5440", 2, 4, "2026-11-20"],
    ["LTP-00006", "SN-2", 1, "Latitude 5440", 2, 4, "2026-11-20"],
  ]);
  assert.deepEqual(linked, [[301, 2], [302, 3]]);
  // One history per unit, all pointing at the same receipt.
  assert.deepEqual(store.histories.map((h) => [h.id_inventory, h.id_ga_purchase_order_item_receipt, h.quantity]),
    [[2, 31, 1], [3, 31, 1]]);

  // Without units the receipt is stocked as one quantity, without a serial number.
  await inventoryService.addFromGaPurchaseOrderReceipt(1, 11,
    { id: 32, type: "accept", quantity_received: 3, quantity_returned: 0, goods_in_date: "2026-11-21" }, 5, t1, null);
  assert.deepEqual([store.inventories[3].product_code, store.inventories[3].serial_number, store.inventories[3].quantity],
    ["LTP-00007", null, 3]);
});

test("Serial numbers must be unique per master item among rows still in stock", async (t) => {
  const db = models.db1;
  const originals = [[db.Inventory, "findOne"], [db.MasterItem, "findByPk"]]
    .map(([target, key]) => [target, key, target[key]]);
  t.after(() => { for (const [target, key, value] of originals) target[key] = value; });
  const locks = [];
  db.MasterItem.findByPk = async (id, options) => { locks.push([id, options.lock]); return { id }; };
  const queries = [];
  db.Inventory.findOne = async ({ where }) => {
    queries.push(where);
    return where.serial_number.includes("SN-B") ? { id: 3, product_code: "LTP-00002", serial_number: "SN-B" } : null;
  };
  await inventoryService.assertSerialsAvailable(1, [" SN-A ", "", null], t1);
  assert.deepEqual(queries[0], { id_master_item: 1, serial_number: ["SN-A"], quantity: { [Op.gt]: 0 } });
  await assert.rejects(inventoryService.assertSerialsAvailable(1, ["SN-A", "SN-B"], t1),
    /serial_number SN-B already exists in inventory \(LTP-00002\)/);
  await assert.rejects(inventoryService.assertSerialsAvailable(1, ["SN-C", " SN-C"], t1),
    /serial_number SN-C is duplicated/);
  // Nothing to check when no serial number is filled in.
  await inventoryService.assertSerialsAvailable(1, ["", null], t1);
  assert.equal(queries.length, 2);
  // The master row is locked before each check.
  assert.deepEqual(locks, [[1, "UPDATE"], [1, "UPDATE"]]);
});
