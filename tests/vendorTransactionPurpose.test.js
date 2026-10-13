const test = require("node:test");
const assert = require("node:assert/strict");
const vendorController = require("../src/controllers/vendor/vendor.controller");
const vendorEditController = require("../src/controllers/vendor/vendorEdit.controller");
const vendorService = require("../src/services/vendor/vendor.service");
const vendorEditService = require("../src/services/vendor/vendorEdit.service");

function response() {
  return {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return body; },
  };
}

test("vendor GET filters by transaction purpose", async (t) => {
  const original = vendorService.getAllWithRelations;
  t.after(() => { vendorService.getAllWithRelations = original; });
  let options;
  vendorService.getAllWithRelations = async (query) => { options = query; return []; };

  const res = response();
  await vendorController.getAll({ query: { transaction_purpose: "Company Services" } }, res);
  assert.equal(res.code, 200);
  assert.equal(options.where.transaction_purpose, "Company Services");
  assert.equal(options.where.is_active, true);

  const invalid = response();
  await vendorController.getAll({ query: { transaction_purpose: "unknown" } }, invalid);
  assert.equal(invalid.code, 400);
});

test("vendor create saves transaction purpose", async (t) => {
  const original = vendorService.createWithRelations;
  t.after(() => { vendorService.createWithRelations = original; });
  let saved;
  vendorService.createWithRelations = async (data) => { saved = data; return { id: 1 }; };
  const res = response();
  await vendorController.create({
    body: { vendor_name: "Vendor A", transaction_purpose: "Internal General Affairs" },
    user: { id: 1, id_department: 2 },
  }, res);
  assert.equal(res.code, 201);
  assert.equal(saved.transaction_purpose, "Internal General Affairs");
});

test("vendor edit GET filters by transaction purpose", async (t) => {
  const original = vendorEditService.getAllWithRelations;
  t.after(() => { vendorEditService.getAllWithRelations = original; });
  let options;
  vendorEditService.getAllWithRelations = async (query) => { options = query; return []; };
  const res = response();
  await vendorEditController.getAll({ query: { transaction_purpose: "Company Services" } }, res);
  assert.equal(res.code, 200);
  assert.equal(options.where.transaction_purpose, "Company Services");
});

test("vendor create validates and passes vendor items", async (t) => {
  const original = vendorService.createWithRelations;
  t.after(() => { vendorService.createWithRelations = original; });
  let items;
  vendorService.createWithRelations = async (data, services, vendorItems) => { items = vendorItems; return { id: 1 }; };
  const user = { id: 1, id_department: 2 };
  const item = { item_name: "Kertas A4", category: "ATK", price_idr: 50000, price_rmb: 0, tax_ppn: true, tax_pph_23: false };

  const res = response();
  await vendorController.create({ body: { vendor_name: "Vendor A", vendor_items: [item] }, user }, res);
  assert.equal(res.code, 201);
  assert.deepEqual(items, [item]);

  for (const [bad, message] of [
    [{ ...item, item_name: "" }, /item_name is required/],
    [{ ...item, category: 3 }, /category must be a string/],
    [{ ...item, price_idr: "abc" }, /price_idr must be a number/],
    [{ ...item, tax_pp_20: "yes" }, /tax_pp_20 must be a boolean/],
  ]) {
    const invalid = response();
    await vendorController.create({ body: { vendor_name: "Vendor A", vendor_items: [bad] }, user }, invalid);
    assert.equal(invalid.code, 400);
    assert.match(invalid.body.message, message);
  }
});

test("vendor update keeps vendor items when they are not sent", async (t) => {
  const originals = { find: vendorService.findById, update: vendorService.updateWithRelations };
  t.after(() => { vendorService.findById = originals.find; vendorService.updateWithRelations = originals.update; });
  const calls = [];
  vendorService.findById = async () => ({ id: 1 });
  vendorService.updateWithRelations = async (id, data, services, vendorItems) => { calls.push(vendorItems); return { id }; };
  await vendorController.update({ params: { id: 1 }, body: { vendor_name: "Vendor A" } }, response());
  await vendorController.update({ params: { id: 1 }, body: { vendor_items: [] } }, response());
  assert.deepEqual(calls, [undefined, []]);
});

test("vendor revision create validates and passes vendor item edits", async (t) => {
  const original = vendorEditService.createWithRelations;
  t.after(() => { vendorEditService.createWithRelations = original; });
  const calls = [];
  vendorEditService.createWithRelations = async (data, services, items) => { calls.push(items); return { id: 1 }; };
  const user = { id: 1, id_department: 2 };
  const body = { id_vendor: 3, vendor_name: "Vendor A" };
  const item = { id_vendor_item: 9, item_name: "Kertas A4", category: "ATK", price_idr: 50000, price_rmb: 0, tax_ppn: true };

  const res = response();
  await vendorEditController.create({ body: { ...body, vendor_item_edits: [item] }, user }, res);
  assert.equal(res.code, 201);
  await vendorEditController.create({ body, user }, response());
  assert.deepEqual(calls, [[item], undefined]);

  const invalid = response();
  await vendorEditController.create({ body: { ...body, vendor_item_edits: [{ ...item, tax_ppn: "1" }] }, user }, invalid);
  assert.equal(invalid.code, 400);
  assert.match(invalid.body.message, /vendor_item_edits\[0\]\.tax_ppn must be a boolean/);
});

test("approving a vendor revision syncs vendor items", async (t) => {
  const { models } = require("../src/models");
  const originals = {
    findAll: models.db1.VendorItem.findAll,
    update: models.db1.VendorItem.update,
    create: models.db1.VendorItem.create,
  };
  t.after(() => Object.assign(models.db1.VendorItem, originals));
  const writes = [];
  models.db1.VendorItem.findAll = async () => [{ id: 9 }, { id: 10 }];
  models.db1.VendorItem.update = async (data, { where }) => { writes.push(["update", where.id, data.item_name ?? data]); return [1]; };
  models.db1.VendorItem.create = async (data) => { writes.push(["create", data.item_name, data.tax_ppn]); return { id: 11 }; };

  await vendorEditService._syncVendorItemsOnApprove(3, [
    { id_vendor_item: 9, item_name: "Kertas A4", price_idr: 1, price_rmb: 0, tax_ppn: false },
    { id_vendor_item: null, item_name: "Tinta", price_idr: 2, price_rmb: 0, tax_ppn: true },
  ], {}, null, false);
  assert.deepEqual(writes, [
    ["update", 9, "Kertas A4"],
    ["create", "Tinta", true],
    ["update", [10], { is_active: false }],
  ]);

  await assert.rejects(vendorEditService._syncVendorItemsOnApprove(3,
    [{ id_vendor_item: 99, item_name: "X", price_idr: 1, price_rmb: 0 }], {}, null, false),
  /does not belong to vendor 3/);
});
