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
