const test = require("node:test");
const assert = require("node:assert/strict");
const purchaseRequestService = require("../src/services/purchaseRequest/purchaseRequest.service");
const gaOrderService = require("../src/services/gaPurchaseOrder/gaPurchaseOrder.service");
const { models, db1, syncProcurementModels } = require("../src/models");
const { Op } = require("sequelize");

test("procurement tables sync in foreign-key dependency order", async (t) => {
  const order = ["PurchaseRequest", "GaPurchaseOrder", "PurchaseRequestItem",
    "PurchaseRequestVerificationProgress", "GaPurchaseOrderItem",
    "GaPurchaseOrderVerificationProgress"];
  const original = [];
  const calls = [];
  for (const [database, dbModels] of [["db1", models.db1], ["db2", models.db2]]) {
    for (const name of order) {
      original.push([dbModels[name], dbModels[name].sync]);
      dbModels[name].sync = async (options) => {
        assert.equal(options.alter, false);
        calls.push(`${database}:${name}`);
      };
    }
  }
  t.after(() => { for (const [model, sync] of original) model.sync = sync; });
  await syncProcurementModels();
  assert.deepEqual(calls, order.flatMap((name) => [`db1:${name}`, `db2:${name}`]));
});

test("procurement document numbers are per company and reset each year", async (t) => {
  const originals = {
    company: models.db1.Company.findAll,
    request: models.db1.PurchaseRequest.findAll,
    order: models.db1.GaPurchaseOrder.findAll,
  };
  t.after(() => {
    models.db1.Company.findAll = originals.company;
    models.db1.PurchaseRequest.findAll = originals.request;
    models.db1.GaPurchaseOrder.findAll = originals.order;
  });
  let dateFilter;
  models.db1.Company.findAll = async () => [
    { id: 1, company_name: "TYS", initial_company: "tyscg" },
    { id: 2, company_name: "Other", initial_company: "oth" },
  ];
  models.db1.PurchaseRequest.findAll = async (options) => {
    dateFilter = options.where.createdAt;
    return [{ id_company: 1, total: "4" }];
  };
  models.db1.GaPurchaseOrder.findAll = async () => [];
  const year = new Date().getFullYear();
  const requests = await purchaseRequestService.getNo();
  const orders = await gaOrderService.getNo();
  assert.equal(requests[0].no_purchase_request, `PUR-TYSCG-${year}-00005`);
  assert.equal(requests[1].no_purchase_request, `PUR-OTH-${year}-00001`);
  assert.equal(orders[0].no_ga_purchase_order, `GAPO-TYSCG-${year}-00001`);
  assert.equal(dateFilter[Op.gte].getFullYear(), year);
  assert.equal(dateFilter[Op.lt].getFullYear(), year + 1);
});

test("Purchase Request item requester always comes from logged-in user", async (t) => {
  const originalFind = models.db1.PurchaseRequestItem.findAll;
  const originalCreate = models.db1.PurchaseRequestItem.create;
  t.after(() => {
    models.db1.PurchaseRequestItem.findAll = originalFind;
    models.db1.PurchaseRequestItem.create = originalCreate;
  });
  let saved;
  models.db1.PurchaseRequestItem.findAll = async () => [];
  models.db1.PurchaseRequestItem.create = async (data) => { saved = data; return { id: 1 }; };
  await purchaseRequestService.syncItems(
    { id: 20, purchase_request_category: "Office Equipment" },
    [{ item_name: "Printer", quantity_unit: "unit", quantity: 1,
      procurement_type: "Pengadaan Baru", id_requester: 999 }],
    7, {}, null,
  );
  assert.equal(saved.id_requester, 7);
  assert.equal(saved.purchase_request_category, "Office Equipment");
});

test("Purchase Request GA approval records each item decision and progress", async (t) => {
  const transaction = db1.transaction;
  const findRequest = models.db1.PurchaseRequest.findByPk;
  const updateRequest = models.db1.PurchaseRequest.update;
  const findItems = models.db1.PurchaseRequestItem.findAll;
  const updateItem = models.db1.PurchaseRequestItem.update;
  const createProgress = models.db1.PurchaseRequestVerificationProgress.create;
  const getById = purchaseRequestService.getById;
  t.after(() => {
    db1.transaction = transaction;
    models.db1.PurchaseRequest.findByPk = findRequest;
    models.db1.PurchaseRequest.update = updateRequest;
    models.db1.PurchaseRequestItem.findAll = findItems;
    models.db1.PurchaseRequestItem.update = updateItem;
    models.db1.PurchaseRequestVerificationProgress.create = createProgress;
    purchaseRequestService.getById = getById;
  });
  const writes = [];
  db1.transaction = async () => ({ LOCK: { UPDATE: "UPDATE" }, commit: async () => {}, rollback: async () => {} });
  models.db1.PurchaseRequest.findByPk = async () => ({ status: "request ga" });
  models.db1.PurchaseRequestItem.findAll = async () => [{ id: 11 }, { id: 12 }];
  models.db1.PurchaseRequestItem.update = async (data, options) => { writes.push([options.where.id, data.ga_decision]); return [1]; };
  models.db1.PurchaseRequest.update = async (data) => { writes.push(["status", data.status]); return [1]; };
  models.db1.PurchaseRequestVerificationProgress.create = async (data) => { writes.push(["progress", data.status]); return { id: 1 }; };
  purchaseRequestService.getById = async () => ({ status: "approved ga" });

  const result = await purchaseRequestService.action(1, "approve_ga", 5, null, [
    { id_purchase_request_item: 11, decision: "approved" },
    { id_purchase_request_item: 12, decision: "rejected" },
  ], false);
  assert.equal(result.status, "approved ga");
  assert.deepEqual(writes, [[11, "approved"], [12, "rejected"], ["status", "approved ga"], ["progress", "approved ga"]]);
});

test("GA approval requires a decision for every Purchase Request item", async (t) => {
  const transaction = db1.transaction;
  const findRequest = models.db1.PurchaseRequest.findByPk;
  const findItems = models.db1.PurchaseRequestItem.findAll;
  t.after(() => {
    db1.transaction = transaction;
    models.db1.PurchaseRequest.findByPk = findRequest;
    models.db1.PurchaseRequestItem.findAll = findItems;
  });
  let rolledBack = false;
  db1.transaction = async () => ({ LOCK: { UPDATE: "UPDATE" }, rollback: async () => { rolledBack = true; } });
  models.db1.PurchaseRequest.findByPk = async () => ({ status: "request ga" });
  models.db1.PurchaseRequestItem.findAll = async () => [{ id: 11 }, { id: 12 }];
  await assert.rejects(purchaseRequestService.action(1, "approve_ga", 5, null,
    [{ id_purchase_request_item: 11, decision: "approved" }], false), /cover every item/);
  assert.equal(rolledBack, true);
});

test("GA Purchase Order rejects a source item that was already ordered", async (t) => {
  const original = models.db1.PurchaseRequestItem.findByPk;
  t.after(() => { models.db1.PurchaseRequestItem.findByPk = original; });
  models.db1.PurchaseRequestItem.findByPk = async () => ({
    id: 11, id_ga_purchase_order: 99, ga_decision: "approved",
    purchase_request: { status: "approved ga", id_company: 1 },
  });
  await assert.rejects(gaOrderService.sourceItem(11, 1, null, { LOCK: { UPDATE: "UPDATE" } }), /already been ordered/);
});

test("GA Purchase Order rejection requires a note", async () => {
  await assert.rejects(gaOrderService.action(1, "reject_fat", 5, "", false), /note is required/);
});

test("GA order candidate query includes only GA-approved unprocessed items", async (t) => {
  const original = models.db1.PurchaseRequestItem.findAll;
  t.after(() => { models.db1.PurchaseRequestItem.findAll = original; });
  let options;
  models.db1.PurchaseRequestItem.findAll = async (query) => { options = query; return []; };
  await purchaseRequestService.getToProcessGaOrder(3);
  assert.equal(options.where.ga_decision, "approved");
  assert.equal(options.where.id_ga_purchase_order, null);
  const parent = options.include.find((entry) => entry.as === "purchase_request");
  assert.equal(parent.where.status, "approved ga");
  assert.equal(parent.where.id_company, 3);
});
