const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const masterItemService = require("../src/services/inventory/masterItem.service");
const { models, db1 } = require("../src/models");

const row = (data) => ({ ...data, toJSON() { const { toJSON, ...plain } = this; return plain; } });

// In-memory stand-in for the master_items table (DB1 only).
function mockStore(t) {
  const db = models.db1;
  const store = {
    items: [row({ id: 1, item_code: "LTP", item_name: "Laptop", is_active: true })],
  };
  const matches = (item, where) => Object.entries(where).every(([key, value]) =>
    value && typeof value === "object" && Op.ne in value ? item[key] !== Number(value[Op.ne]) : item[key] === value);
  const replace = [
    [db1, "transaction", async () => ({ LOCK: { UPDATE: "UPDATE" }, commit: async () => {}, rollback: async () => {} })],
    [db.MasterItem, "findOne", async ({ where }) => {
      const plain = { ...where, ...(where.id !== undefined && typeof where.id !== "object" && { id: Number(where.id) }) };
      return store.items.find((item) => matches(item, plain)) || null;
    }],
    [db.MasterItem, "create", async (data) => {
      const created = row({ id: store.items.length + 1, ...data });
      store.items.push(created);
      return created;
    }],
    [db.MasterItem, "update", async (data, { where }) => {
      Object.assign(store.items.find((item) => item.id === Number(where.id)), data);
      return [1];
    }],
    // No purchase request uses these masters, so their codes can still change.
    [db.PurchaseRequestItem, "count", async () => 0],
  ];
  const originals = replace.map(([target, key]) => [target, key, target[key]]);
  t.after(() => { for (const [target, key, value] of originals) target[key] = value; });
  for (const [target, key, value] of replace) target[key] = value;
  return store;
}

test("Master item code is trimmed, uppercased and must be unique", async (t) => {
  const store = mockStore(t);
  const created = await masterItemService.create({ item_code: " mnt ", item_name: " Monitor " }, false);
  assert.deepEqual([created.item_code, created.item_name, created.is_active], ["MNT", "Monitor", true]);
  await assert.rejects(masterItemService.create({ item_code: "ltp", item_name: "Laptop 2" }, false),
    /item_code LTP already exists/);
  // A deactivated code still cannot be reused.
  await masterItemService.remove(2, false);
  assert.equal(store.items[1].is_active, false);
  await assert.rejects(masterItemService.create({ item_code: "MNT", item_name: "Monitor" }, false),
    /item_code MNT already exists/);
});

test("Master item code must be 2-10 letters or digits", async (t) => {
  mockStore(t);
  for (const code of ["L", "LTP-01", "ABCDEFGHIJK", "LT P"])
    await assert.rejects(masterItemService.create({ item_code: code, item_name: "X" }, false),
      /item_code must be 2-10 uppercase letters or digits/);
});

test("Master item update keeps its own code and rejects another item's code", async (t) => {
  const store = mockStore(t);
  await masterItemService.create({ item_code: "MNT", item_name: "Monitor" }, false);
  const renamed = await masterItemService.update(1, { item_code: "ltp", item_name: "Laptop Kantor" }, false);
  assert.deepEqual([renamed.item_code, renamed.item_name], ["LTP", "Laptop Kantor"]);
  await assert.rejects(masterItemService.update(1, { item_code: "MNT" }, false), /item_code MNT already exists/);
  await masterItemService.remove(2, false);
  await assert.rejects(masterItemService.update(2, { item_name: "X" }, false), /Master item not found/);
  assert.equal(store.items[1].item_name, "Monitor");
});
