const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const inventoryRequestService = require("../src/services/inventory/inventoryRequest.service");
const inventoryService = require("../src/services/inventory/inventory.service");
const { models, db1 } = require("../src/models");

const row = (data) => ({ ...data, toJSON() { const { toJSON, ...plain } = this; return plain; } });

// In-memory inventory requests, their units, master items, places and stock (DB1 only).
function mockStore(t) {
  const db = models.db1;
  const store = {
    requests: [],
    units: [],
    inventories: [],
    draftUnits: [],
    histories: [],
    nextUnitId: 1,
  };
  const replace = [
    [db1, "transaction", async () => ({ LOCK: { UPDATE: "UPDATE" }, commit: async () => {}, rollback: async () => {} })],
    [db.Company, "findOne", async ({ where }) => (Number(where.id) === 2 ? { id: 2, id_inventory_location: 4 } : null)],
    [db.InventoryLocation, "findOne", async ({ where }) => (Number(where.id) === 4 ? { id: 4 } : null)],
    [db.MasterItem, "findOne", async ({ where }) => (Number(where.id) === 1 ? { id: 1, item_name: "Laptop" } : null)],
    [db.MasterItem, "findByPk", async (id) => ({ id: Number(id), item_code: "LTP" })],
    [db.InventoryRequest, "create", async (data) => {
      const created = row({ id: store.requests.length + 1, is_active: true, ...data });
      store.requests.push(created);
      return created;
    }],
    [db.InventoryRequest, "findOne", async ({ where }) => store.requests.find((r) => r.id === Number(where.id)) || null],
    [db.InventoryRequest, "findByPk", async (id) => store.requests.find((r) => r.id === Number(id)) || null],
    [db.InventoryRequest, "update", async (data, { where }) => {
      Object.assign(store.requests.find((r) => r.id === Number(where.id)), data); return [1];
    }],
    [db.InventoryRequestVerificationProgress, "create", async (data) => data],
    [db.InventoryRequestUnit, "create", async (data) => {
      const unit = row({ id: store.nextUnitId++, id_inventory: null, ...data });
      store.units.push(unit);
      return unit;
    }],
    [db.InventoryRequestUnit, "destroy", async ({ where }) => {
      store.units = store.units.filter((unit) => unit.id_inventory_request !== Number(where.id_inventory_request));
      return 1;
    }],
    [db.InventoryRequestUnit, "findAll", async ({ where }) =>
      store.units.filter((unit) => unit.id_inventory_request === Number(where.id_inventory_request))],
    [db.InventoryRequestUnit, "update", async (data, { where }) => {
      Object.assign(store.units.find((unit) => unit.id === where.id), data); return [1];
    }],
    // A serial number held by another pending request of the same master item.
    [db.InventoryRequestUnit, "findOne", async ({ where, include }) => {
      const requestWhere = include[0].where;
      return store.units.find((unit) => {
        const request = store.requests.find((r) => r.id === unit.id_inventory_request);
        return where.serial_number.includes(unit.serial_number) && request.status === requestWhere.status
          && request.id_master_item === requestWhere.id_master_item && request.id !== requestWhere.id?.[Op.ne];
      }) || null;
    }],
    [db.GaPurchaseOrderItemReceiptUnit, "findOne", async ({ where }) =>
      store.draftUnits.find((unit) => where.serial_number.includes(unit.serial_number)) || null],
    [db.Inventory, "findOne", async ({ where }) => {
      if (where.product_code) {
        const codes = store.inventories.map((inv) => inv.product_code).filter(Boolean).sort().reverse();
        return codes.length ? { product_code: codes[0] } : null;
      }
      // Serial number check: rows of the master item still in stock.
      if (where.serial_number && !where[Op.and])
        return store.inventories.find((inv) => where.serial_number.includes(inv.serial_number) && inv.quantity > 0) || null;
      return null;
    }],
    [db.Inventory, "create", async (data) => {
      const created = row({ id: 50 + store.inventories.length, ...data });
      store.inventories.push(created);
      return created;
    }],
    [db.InventoryHistory, "create", async (data) => { store.histories.push(data); return data; }],
    [inventoryRequestService, "getById", async (id) => store.requests.find((r) => r.id === Number(id))],
  ];
  const originals = replace.map(([target, key]) => [target, key, target[key]]);
  t.after(() => { for (const [target, key, value] of originals) target[key] = value; });
  for (const [target, key, value] of replace) target[key] = value;
  return store;
}

const body = { id_master_item: 1, brand: "Dell", model_number: "Latitude 5440", quantity_unit: "unit", quantity: 2,
  received_date: "2026-11-20", id_company: 2 };
const units = (...serials) => serials.map((serial_number) => ({ serial_number }));

test("Inventory request with serial numbers needs one serial per unit of a whole quantity", async (t) => {
  const store = mockStore(t);
  const create = (extra) => inventoryRequestService.create({ ...body, has_serial_number: true, ...extra }, 5, false);
  await assert.rejects(create({ quantity: 1.5, units: units("A") }), /quantity \(1\.5\) must be a whole number/);
  await assert.rejects(create({ units: units("A") }), /units must have 2 entries, one serial number per unit/);
  await assert.rejects(create({ units: units("A", " ") }), /units\[1\]\.serial_number is required/);
  await assert.rejects(create({ units: units("A", "A") }), /serial_number A is duplicated/);
  store.inventories.push(row({ id: 9, product_code: "LTP-00003", serial_number: "IN-STOCK", quantity: 1 }));
  await assert.rejects(create({ units: units("A", "IN-STOCK") }), /IN-STOCK already exists in inventory \(LTP-00003\)/);
  store.draftUnits.push({ serial_number: "IN-DRAFT" });
  await assert.rejects(create({ units: units("A", "IN-DRAFT") }), /IN-DRAFT is already in another draft goods receipt/);
  assert.deepEqual(store.requests, []);

  const created = await create({ units: units(" SN-1 ", "SN-2") });
  assert.deepEqual([created.item_name, created.model_number, created.has_serial_number, created.id_inventory_location],
    ["Laptop", "Latitude 5440", true, 4]);
  assert.deepEqual(store.units.map((unit) => [unit.id_inventory_request, unit.serial_number]), [[1, "SN-1"], [1, "SN-2"]]);
  // Another pending request of the same master cannot take the same serial number.
  await assert.rejects(create({ units: units("SN-2", "SN-3") }), /SN-2 is already in a pending inventory request/);
});

test("Editing an inventory request replaces its units when quantity, mode or units change", async (t) => {
  const store = mockStore(t);
  await inventoryRequestService.create({ ...body, has_serial_number: true, units: units("SN-1", "SN-2") }, 5, false);
  // Its own units do not block it.
  await inventoryRequestService.update(1, { quantity: 3, units: units("SN-1", "SN-2", "SN-3") }, 5, false);
  assert.deepEqual(store.units.map((unit) => unit.serial_number), ["SN-1", "SN-2", "SN-3"]);
  await assert.rejects(inventoryRequestService.update(1, { quantity: 1 }, 5, false), /units must have 1 entries/);
  // A note-only edit keeps the units.
  await inventoryRequestService.update(1, { note: "Stok awal" }, 5, false);
  assert.equal(store.units.length, 3);
  // Switching to quantity only drops the units.
  await inventoryRequestService.update(1, { has_serial_number: false }, 5, false);
  assert.deepEqual([store.requests[0].has_serial_number, store.units.length], [false, 0]);
});

test("Approving an inventory request with serial numbers stocks each unit as its own coded row", async (t) => {
  const store = mockStore(t);
  await inventoryRequestService.create({ ...body, has_serial_number: true, units: units("SN-1", "SN-2") }, 5, false);
  await inventoryRequestService.approve(1, 9, "OK", false);
  assert.deepEqual(store.inventories.map((inv) => [inv.product_code, inv.serial_number, inv.quantity, inv.item_name,
    inv.model_number, inv.id_master_item]), [
    ["LTP-00001", "SN-1", 1, "Laptop", "Latitude 5440", 1],
    ["LTP-00002", "SN-2", 1, "Laptop", "Latitude 5440", 1],
  ]);
  assert.deepEqual(store.units.map((unit) => unit.id_inventory), [50, 51]);
  // The units link their rows; the request itself has no single row.
  assert.deepEqual([store.requests[0].status, store.requests[0].id_inventory], ["approve", null]);
  assert.deepEqual(store.histories.map((h) => [h.id_inventory, h.id_inventory_request, h.quantity]), [[50, 1, 1], [51, 1, 1]]);
});

test("Approving an inventory request without serial numbers adds one coded row", async (t) => {
  const store = mockStore(t);
  await inventoryRequestService.create(body, 5, false);
  assert.equal(store.requests[0].has_serial_number, false);
  await inventoryRequestService.approve(1, 9, null, false);
  assert.deepEqual(store.inventories.map((inv) => [inv.product_code, inv.serial_number, inv.quantity]),
    [["LTP-00001", null, 2]]);
  assert.equal(store.requests[0].id_inventory, 50);
});
