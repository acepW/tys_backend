const test = require("node:test");
const assert = require("node:assert/strict");
const purchaseRequestService = require("../src/services/purchaseRequest/purchaseRequest.service");
const gaOrderService = require("../src/services/gaPurchaseOrder/gaPurchaseOrder.service");
const inventoryService = require("../src/services/inventory/inventory.service");
const { models, db1, syncProcurementModels } = require("../src/models");
const { Op } = require("sequelize");

test("procurement tables sync in foreign-key dependency order", async (t) => {
  const order = ["PurchaseRequest", "GaPurchaseOrder", "PurchaseRequestItem",
    "PurchaseRequestVerificationProgress", "GaPurchaseOrderItem",
    "GaPurchaseOrderVerificationProgress", "Inventory", "InventoryHistory"];
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

test("GA Purchase Order rejection and return require a note", async () => {
  await assert.rejects(gaOrderService.action(1, "reject_fat", 5, { note: "" }, false), /note is required/);
  await assert.rejects(gaOrderService.action(1, "return_goods", 5, {}, false), /note is required for return/);
});

function mockGaOrder(t, order, fileCounts = {}) {
  const originals = {
    transaction: db1.transaction,
    findByPk: models.db1.GaPurchaseOrder.findByPk,
    update: models.db1.GaPurchaseOrder.update,
    progress: models.db1.GaPurchaseOrderVerificationProgress.create,
    count: models.db1.File.count,
    getById: gaOrderService.getById,
  };
  t.after(() => {
    db1.transaction = originals.transaction;
    models.db1.GaPurchaseOrder.findByPk = originals.findByPk;
    models.db1.GaPurchaseOrder.update = originals.update;
    models.db1.GaPurchaseOrderVerificationProgress.create = originals.progress;
    models.db1.File.count = originals.count;
    gaOrderService.getById = originals.getById;
  });
  const writes = [];
  db1.transaction = async () => ({ LOCK: { UPDATE: "UPDATE" }, commit: async () => {}, rollback: async () => {} });
  models.db1.GaPurchaseOrder.findByPk = async () => order;
  models.db1.GaPurchaseOrder.update = async (data) => { writes.push(["order", data]); Object.assign(order, data); return [1]; };
  models.db1.GaPurchaseOrderVerificationProgress.create = async (data) => { writes.push(["progress", data.status]); return { id: 1 }; };
  models.db1.File.count = async ({ where }) => fileCounts[where.category] ?? 0;
  gaOrderService.getById = async () => order;
  return writes;
}

test("GA Purchase Order follows the approval chain up to receiving", async (t) => {
  const order = { status: "request ga manager", return_count: 0 };
  mockGaOrder(t, order, { files_payment: 1 });
  for (const [action, status] of [["approve_ga_manager", "request director"], ["approve_director", "request ar ap"],
    ["approve_ar_ap", "request fat"], ["approve_fat", "request cashier"]]) {
    await gaOrderService.action(1, action, 5, {}, false);
    assert.equal(order.status, status);
  }
  await assert.rejects(gaOrderService.action(1, "approve_cashier", 5, {}, false), /payment_amount/);
  await gaOrderService.action(1, "approve_cashier", 5,
    { payment_amount: 6660000, payment_date: "2026-10-06", payment_note: "Transfer" }, false);
  assert.equal(order.status, "request receiving");
  assert.equal(order.payment_amount, 6660000);
  await assert.rejects(gaOrderService.action(1, "approve_fat", 5, {}, false), /not allowed/);
});

test("GA Purchase Order return cycle goes through GA manager, AR/AP and cashier", async (t) => {
  const order = { status: "request receiving", return_count: 0 };
  const writes = mockGaOrder(t, order);
  await gaOrderService.action(1, "return_goods", 5, { note: "Barang rusak" }, false);
  assert.equal(order.status, "return request ga manager");
  assert.equal(order.return_count, 1);
  await assert.rejects(gaOrderService.action(1, "approve_director", 5, {}, false), /not allowed/);
  for (const action of ["approve_ga_manager", "approve_ar_ap", "approve_cashier"])
    await gaOrderService.action(1, action, 5, {}, false);
  assert.equal(order.status, "request receiving");
  assert.deepEqual(writes.filter(([kind]) => kind === "progress").map(([, status]) => status),
    ["return request ga manager", "return request ar ap", "return request cashier", "request receiving"]);
});

test("GA Purchase Order acceptance requires receipt data and files", async (t) => {
  const order = { status: "request receiving", return_count: 0, received_date: null };
  const counts = { files_purchase_proof: 1, files_goods_receipt: 0 };
  mockGaOrder(t, order, counts);
  const addInventory = inventoryService.addFromGaPurchaseOrder;
  t.after(() => { inventoryService.addFromGaPurchaseOrder = addInventory; });
  const inventoryCalls = [];
  inventoryService.addFromGaPurchaseOrder = async (orderId) => { inventoryCalls.push(orderId); };
  await assert.rejects(gaOrderService.action(1, "accept_goods", 5, {}, false), /received_date is required/);
  await assert.rejects(gaOrderService.action(1, "accept_goods", 5, { received_date: "2026-10-06" }, false),
    /files_goods_receipt is required/);
  counts.files_goods_receipt = 1;
  await gaOrderService.action(1, "accept_goods", 5, {}, false);
  assert.equal(order.status, "finished");
  assert.deepEqual(inventoryCalls, [1]);
});

test("Accepted goods add quantity to a matching inventory row or create a new one", async (t) => {
  const originals = {
    items: models.db1.GaPurchaseOrderItem.findAll,
    findOne: models.db1.Inventory.findOne,
    invUpdate: models.db1.Inventory.update,
    invCreate: models.db1.Inventory.create,
    history: models.db1.InventoryHistory.create,
    files: models.db1.File.findAll,
    fileCreate: models.db1.File.create,
  };
  t.after(() => {
    models.db1.GaPurchaseOrderItem.findAll = originals.items;
    models.db1.Inventory.findOne = originals.findOne;
    models.db1.Inventory.update = originals.invUpdate;
    models.db1.Inventory.create = originals.invCreate;
    models.db1.InventoryHistory.create = originals.history;
    models.db1.File.findAll = originals.files;
    models.db1.File.create = originals.fileCreate;
  });
  const file = (stored_name) => ({ stored_name, original_name: stored_name, url: "/files/" + stored_name, mime_type: "image/png", size: 1 });
  models.db1.GaPurchaseOrderItem.findAll = async () => [
    { id: 21, item_name: "Printer", brand: "HP", serial_number: "M404dn", size: "", material: null, other: null,
      quantity_unit: "unit", quantity: "2.00", purchase_request_category: "Office", files_product: [file("a.png"), file("b.png")] },
    { id: 22, item_name: "Printer", brand: "Canon", serial_number: null, size: null, material: null, other: null,
      quantity_unit: "unit", quantity: "1.00", purchase_request_category: "Office", files_product: [] },
  ];
  const wheres = [];
  models.db1.Inventory.findOne = async ({ where }) => {
    wheres.push(where);
    return where[Op.and].some((cond) => cond.brand === "HP") ? { id: 7, quantity: "3.00" } : null;
  };
  const writes = [];
  models.db1.Inventory.update = async (data, { where }) => { writes.push(["update", where.id, data.quantity]); return [1]; };
  models.db1.Inventory.create = async (data) => { writes.push(["create", data.brand, data.quantity]); return { id: 8 }; };
  models.db1.InventoryHistory.create = async (data) => { writes.push(["history", data.id_inventory, data.id_ga_purchase_order_item]); return {}; };
  models.db1.File.findAll = async () => [{ stored_name: "a.png" }];
  models.db1.File.create = async (data) => { writes.push(["file", data.fileable_id, data.stored_name]); return {}; };

  await inventoryService.addFromGaPurchaseOrder(1, 5, { LOCK: { UPDATE: "UPDATE" } });

  assert.deepEqual(wheres[0][Op.and].slice(0, 3), [{ item_name: "Printer" }, { brand: "HP" }, { serial_number: "M404dn" }]);
  assert.deepEqual(wheres[0][Op.and][3], { [Op.or]: [{ size: null }, { size: "" }] });
  assert.deepEqual(writes, [
    ["update", 7, 5], ["history", 7, 21], ["file", 7, "b.png"],
    ["create", "Canon", "1.00"], ["history", 8, 22],
  ]);
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
