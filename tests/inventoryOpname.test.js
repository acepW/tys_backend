const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const opnameService = require("../src/services/inventory/inventoryOpname.service");
const { models, db1 } = require("../src/models");

// In-memory stand-in for the opname, inventory and history tables (DB1 only).
function mockStore(t, inventories) {
  const db = models.db1;
  const store = { opnames: [], items: [], histories: [], progress: [], inventories };
  const replace = [
    [db1, "transaction", async () => ({ LOCK: { UPDATE: "UPDATE" }, commit: async () => {}, rollback: async () => {} })],
    [db.InventoryOpname, "findOne", async ({ where }) => {
      if (where.id !== undefined) return store.opnames.find((row) => row.id === Number(where.id) && row.is_active) || null;
      if (where.status) return store.opnames.find((row) => where.status.includes(row.status) && row.is_active) || null;
      return store.opnames.at(-1) || null;
    }],
    [db.InventoryOpname, "create", async (data) => {
      const row = { id: store.opnames.length + 1, is_active: true, ...data };
      store.opnames.push(row);
      return row;
    }],
    [db.InventoryOpname, "update", async (data, { where }) => {
      Object.assign(store.opnames.find((row) => row.id === where.id), data);
      return [1];
    }],
    [db.Inventory, "findAll", async () => store.inventories],
    [db.Inventory, "findByPk", async (id) => store.inventories.find((row) => row.id === id) || null],
    [db.Inventory, "update", async (data, { where }) => {
      Object.assign(store.inventories.find((row) => row.id === where.id), data);
      return [1];
    }],
    [db.InventoryOpnameItem, "bulkCreate", async (rows) => rows.map((data) => {
      const row = { id: 100 + store.items.length + 1, ...data };
      store.items.push(row);
      return row;
    })],
    [db.InventoryOpnameItem, "findAll", async ({ where }) => store.items.filter((row) =>
      row.id_inventory_opname === where.id_inventory_opname &&
      (where.id === undefined || where.id.includes(row.id)) &&
      (where.quantity_difference === undefined || Number(row.quantity_difference) !== 0))],
    [db.InventoryOpnameItem, "count", async ({ where }) => store.items.filter((row) =>
      row.id_inventory_opname === where.id_inventory_opname && row.status !== where.status[Op.ne]).length],
    [db.InventoryOpnameItem, "update", async (data, { where }) => {
      Object.assign(store.items.find((row) => row.id === where.id), data);
      return [1];
    }],
    [db.InventoryHistory, "create", async (data) => { store.histories.push(data); return data; }],
    [db.InventoryOpnameVerificationProgress, "create", async (data) => {
      store.progress.push([data.status, data.note]);
      return data;
    }],
    [opnameService, "getById", async (id) => store.opnames.find((row) => row.id === Number(id))],
  ];
  const originals = replace.map(([target, key]) => [target, key, target[key]]);
  t.after(() => { for (const [target, key, value] of originals) target[key] = value; });
  for (const [target, key, value] of replace) target[key] = value;
  return store;
}

const inventoryRows = () => [
  { id: 1, item_name: "Kursi", brand: null, serial_number: null, size: null, material: null, other: null,
    quantity_unit: "unit", quantity: "10.00" },
  { id: 2, item_name: "Meja", brand: "Olympic", serial_number: null, size: null, material: null, other: null,
    quantity_unit: "unit", quantity: "4.00" },
];

test("Creating an opname copies every inventory row as a pending item with an automatic number", async (t) => {
  const store = mockStore(t, inventoryRows());
  const opname = await opnameService.create({ opname_date: "2026-10-20", note: "Opname Oktober" }, 5, false);
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  assert.equal(opname.opname_no, `OPN-${month}-${year}-0001`);
  assert.equal(opname.status, "pending");
  assert.equal(opname.id_user_opname, 5);
  assert.deepEqual(store.items.map((item) => [item.id_inventory, item.item_name, item.quantity_system, item.status]),
    [[1, "Kursi", "10.00", "pending"], [2, "Meja", "4.00", "pending"]]);
  await assert.rejects(opnameService.create({}, 5, false), /is still pending; finish it/);

  await opnameService.cancel(1, 5, false);
  const next = await opnameService.create({}, 5, false);
  assert.equal(next.opname_no, `OPN-${month}-${year}-0002`);
});

test("Opname flow: save counts, request, review items, correct a rejection, approve and adjust stock", async (t) => {
  const store = mockStore(t, inventoryRows());
  await opnameService.create({}, 5, false);
  const [kursi, meja] = store.items.map((item) => item.id);

  await assert.rejects(opnameService.saveItems(1, [{ id: kursi, quantity_actual: 8 }], 9, false), /Only the creator/);
  await assert.rejects(opnameService.saveItems(1, [{ id: 999, quantity_actual: 8 }], 5, false), /items not found: 999/);
  await opnameService.saveItems(1, [{ id: kursi, quantity_actual: 8, input_status: " 2 patah ", note: "Gudang A" }], 5, false);
  assert.deepEqual([store.items[0].status, store.items[0].quantity_difference, store.items[0].input_status], ["save", -2, "2 patah"]);
  await assert.rejects(opnameService.request(1, 5, null, false), /1 items have not been saved yet/);
  await assert.rejects(opnameService.reviewItems(1, [{ id: kursi, decision: "approve" }], 7, false), /while the opname is request/);

  await opnameService.saveItems(1, [{ id: kursi, quantity_actual: 9 }, { id: meja, quantity_actual: 4 }], 5, false);
  await opnameService.request(1, 5, null, false);
  assert.equal(store.opnames[0].status, "request");
  await assert.rejects(opnameService.saveItems(1, [{ id: kursi, quantity_actual: 7 }], 5, false), /while it is save/);

  await opnameService.reviewItems(1, [{ id: kursi, decision: "reject", note: "Hitung ulang" }, { id: meja, decision: "approve" }], 7, false);
  assert.deepEqual(store.items.map((item) => item.status), ["reject", "approve"]);
  assert.equal(store.items[0].review_note, "Hitung ulang");
  await assert.rejects(opnameService.approve(1, 7, null, false), /1 items have not been approved yet/);
  await assert.rejects(opnameService.reviewItems(1, [{ id: meja, decision: "reject", note: "x" }], 7, false), /while it is approve/);

  await opnameService.saveItems(1, [{ id: kursi, quantity_actual: 7, note: "Sudah dihitung ulang" }], 5, false);
  assert.equal(store.items[0].status, "save");
  assert.equal(store.items[0].quantity_difference, -3);
  await opnameService.reviewItems(1, [{ id: kursi, decision: "approve" }], 7, false);

  store.inventories[0].quantity = "12.00"; // 2 units came in from a GA purchase order during the count
  await opnameService.approve(1, 7, "OK", false);
  assert.equal(store.opnames[0].status, "approved");
  assert.equal(store.inventories[0].quantity, 9);
  assert.equal(store.inventories[1].quantity, "4.00");
  assert.deepEqual(store.histories.map((row) => [row.id_inventory, row.id_inventory_opname_item, row.quantity]), [[1, kursi, -3]]);
  assert.deepEqual(store.progress, [
    ["pending", "Inventory opname created with 2 items"],
    ["save items", "1 items saved"],
    ["save items", "2 items saved"],
    ["request", null],
    ["review items", "1 items approved, 1 items rejected"],
    ["save items", "1 items saved (1 rejected items corrected)"],
    ["review items", "1 items approved, 0 items rejected"],
    ["approved", "OK"],
  ]);
  await assert.rejects(opnameService.approve(1, 7, null, false), /while it is approved/);
});

test("Opname approval refuses to make stock negative", async (t) => {
  const store = mockStore(t, inventoryRows());
  await opnameService.create({}, 5, false);
  await opnameService.saveItems(1, store.items.map((item) => ({ id: item.id, quantity_actual: 0 })), 5, false);
  await opnameService.request(1, 5, null, false);
  await opnameService.reviewItems(1, store.items.map((item) => ({ id: item.id, decision: "approve" })), 7, false);
  store.inventories[0].quantity = "6.00";
  await assert.rejects(opnameService.approve(1, 7, null, false), /Stock of Kursi would become negative \(-4\)/);
});
