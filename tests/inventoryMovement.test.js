const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const movementService = require("../src/services/inventory/inventoryMovement.service");
const { models, db1 } = require("../src/models");

const row = (data) => ({ ...data, toJSON() { const { toJSON, ...plain } = this; return plain; } });

// In-memory stand-in for the movement, inventory and history tables (DB1 only).
function mockStore(t) {
  const db = models.db1;
  const store = {
    movements: [],
    progress: [],
    histories: [],
    inventories: [
      row({ id: 1, item_name: "Pulpen Gel Hitam", brand: "Joyko", serial_number: null, size: null, material: null,
        other: null, purchase_request_category: "ATK", asset_category: "non asset", quantity_unit: "pcs",
        quantity: "30.00", received_date: "2026-10-01", id_company: 2, id_inventory_location: 3, files_product: [] }),
      row({ id: 2, item_name: "Pulpen Gel Hitam", brand: "Joyko", serial_number: null, size: null, material: null,
        other: null, quantity_unit: "pcs", quantity: "250.00", id_company: 2, id_inventory_location: 1 }),
    ],
  };
  // matchWhere conditions: { field: value } or { [Op.or]: [{ field: null }, { field: "" }] }.
  const matches = (inv, cond) => cond[Op.or]
    ? cond[Op.or].some((option) => matches(inv, option))
    : Object.entries(cond).every(([key, value]) => (inv[key] ?? null) === value);
  const replace = [
    [db1, "transaction", async () => ({ LOCK: { UPDATE: "UPDATE" }, commit: async () => {}, rollback: async () => {} })],
    [db.Inventory, "findByPk", async (id) => store.inventories.find((inv) => inv.id === Number(id)) || null],
    [db.Inventory, "findOne", async ({ where }) =>
      store.inventories.find((inv) => where[Op.and].every((cond) => matches(inv, cond))) || null],
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
    [db.InventoryLocation, "findOne", async ({ where }) => [1, 3].includes(Number(where.id)) ? { id: Number(where.id) } : null],
    [db.Company, "findByPk", async () => ({ id: 2, company_name: "PT Tys", initial_company: "TYS" })],
    [db.InventoryMovement, "findOne", async ({ where }) => {
      if (where.id !== undefined) return store.movements.find((mv) => mv.id === Number(where.id)) || null;
      return store.movements.at(-1) || null;
    }],
    [db.InventoryMovement, "create", async (data) => {
      const created = { id: store.movements.length + 1, is_active: true, ...data };
      store.movements.push(created);
      return created;
    }],
    [db.InventoryMovement, "update", async (data, { where }) => {
      Object.assign(store.movements.find((mv) => mv.id === where.id), data);
      return [1];
    }],
    [db.InventoryMovementVerificationProgress, "create", async (data) => {
      store.progress.push([data.status, data.note]);
      return data;
    }],
    [movementService, "getById", async (id) => store.movements.find((mv) => mv.id === Number(id))],
  ];
  const originals = replace.map(([target, key]) => [target, key, target[key]]);
  t.after(() => { for (const [target, key, value] of originals) target[key] = value; });
  for (const [target, key, value] of replace) target[key] = value;
  return store;
}

const body = { movement_type: "stock transfer", id_inventory_source: 1, id_inventory_location_destination: 1,
  quantity: 10, reason: "Replenishment" };

test("Movement is approved by SPV GA then Manager GA, and only the last approval moves the stock", async (t) => {
  const store = mockStore(t);
  const movement = await movementService.create(body, 5, false);
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  assert.equal(movement.movement_no, `IM-TYS-${month}-${year}-0001`);
  assert.deepEqual([movement.status, movement.id_company, movement.id_inventory_location_source, movement.item_name],
    ["request spv ga", 2, 3, "Pulpen Gel Hitam"]);

  await movementService.approve(1, 7, "OK SPV", false);
  assert.equal(store.movements[0].status, "request manager ga");
  assert.equal(store.inventories[0].quantity, "30.00");

  await movementService.approve(1, 8, null, false);
  assert.equal(store.movements[0].status, "approved");
  // Same item, company and destination location: added to the existing row.
  assert.equal(store.movements[0].id_inventory_destination, 2);
  assert.deepEqual(store.inventories.map((inv) => Number(inv.quantity)), [20, 260]);
  assert.deepEqual(store.inventories.map((inv) => inv.movement_status), ["stock transfer", "stock transfer"]);
  assert.deepEqual(store.histories.map((h) => [h.id_inventory, h.id_inventory_movement, h.quantity]),
    [[1, 1, -10], [2, 1, 10]]);
  assert.deepEqual(store.progress.map(([status]) => status),
    ["request spv ga", "approved spv ga", "approved manager ga"]);
  await assert.rejects(movementService.approve(1, 8, null, false), /already approved/);
  await assert.rejects(movementService.reject(1, 8, "x", false), /already approved/);

  const next = await movementService.create(body, 5, false);
  assert.equal(next.movement_no, `IM-TYS-${month}-${year}-0002`);
});

test("Allocation to a location without the item creates a new inventory row there", async (t) => {
  const store = mockStore(t);
  store.inventories[1].id_inventory_location = 9;
  store.inventories[0].movement_status = "stock transfer";
  await movementService.create({ ...body, movement_type: "stock allocation", quantity: 30 }, 5, false);
  await movementService.approve(1, 7, null, false);
  assert.equal(store.inventories[0].movement_status, "stock transfer");
  await movementService.approve(1, 8, null, false);
  // The last approved movement replaces the status; untouched rows keep theirs.
  assert.deepEqual(store.inventories.map((inv) => inv.movement_status ?? null),
    ["stock allocation", null, "stock allocation"]);
  const created = store.inventories[2];
  assert.deepEqual([created.item_name, created.brand, created.id_company, created.id_inventory_location,
    created.quantity, created.received_date], ["Pulpen Gel Hitam", "Joyko", 2, 1, 30, "2026-10-01"]);
  assert.equal(Number(store.inventories[0].quantity), 0);
  assert.equal(store.histories[0].note, `Stock allocation ${store.movements[0].movement_no}`);
});

test("Movement checks the stock, the destination and rejects with a note", async (t) => {
  const store = mockStore(t);
  await assert.rejects(movementService.create({ ...body, quantity: 31 }, 5, false), /Insufficient stock: source only has 30 pcs/);
  await assert.rejects(movementService.create({ ...body, id_inventory_location_destination: 3 }, 5, false),
    /must differ from the source location/);
  await assert.rejects(movementService.create({ ...body, id_inventory_location_destination: 99 }, 5, false),
    /Destination location not found/);
  await assert.rejects(movementService.create({ ...body, id_inventory_source: 99 }, 5, false), /Source inventory not found/);

  // Stock taken out in between is checked again on the final approval.
  await movementService.create({ ...body, quantity: 25 }, 5, false);
  await movementService.approve(1, 7, null, false);
  store.inventories[0].quantity = "20.00";
  await assert.rejects(movementService.approve(1, 8, null, false), /Insufficient stock: source only has 20 pcs/);

  await assert.rejects(movementService.reject(1, 8, " ", false), /note is required/);
  await movementService.reject(1, 8, "Stok kurang", false);
  assert.equal(store.movements[0].status, "rejected");
  assert.deepEqual(store.progress.at(-1), ["rejected manager ga", "Stok kurang"]);
  assert.equal(store.histories.length, 0);
});

test("Movement create validates the body", async (t) => {
  const controller = require("../src/controllers/inventory/inventoryMovement.controller");
  const original = movementService.create;
  t.after(() => { movementService.create = original; });
  movementService.create = async (input) => input;
  const call = async (input) => {
    const res = { status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } };
    await controller.create({ body: input, user: { id: 5 } }, res);
    return [res.code, res.payload.message];
  };
  assert.deepEqual(await call({ ...body, movement_type: "transfer" }),
    [400, "movement_type must be one of: stock transfer, stock allocation"]);
  assert.deepEqual(await call({ ...body, id_inventory_source: null }), [400, "id_inventory_source is required"]);
  assert.deepEqual(await call({ ...body, id_inventory_location_destination: "" }),
    [400, "id_inventory_location_destination is required"]);
  assert.deepEqual(await call({ ...body, quantity: 0 }), [400, "quantity must be a positive number"]);
  assert.equal((await call(body))[0], 201);
});
