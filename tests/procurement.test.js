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
    "GaPurchaseOrderVerificationProgress", "GaPurchaseOrderItemReceipt", "GaPurchaseOrderItemRealization",
    "Inventory", "InventoryRequest",
    "InventoryRequestVerificationProgress", "InventoryOpname", "InventoryOpnameItem", "InventoryOpnameItemDetail",
    "InventoryOpnameVerificationProgress", "InventoryHistory"];
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
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const requests = await purchaseRequestService.getNo();
  const orders = await gaOrderService.getNo();
  assert.equal(requests[0].no_purchase_request, `PUR-TYSCG-${year}-0005`);
  assert.equal(requests[1].no_purchase_request, `PUR-OTH-${year}-0001`);
  assert.equal(orders[0].no_ga_purchase_order, `GAPO-TYSCG-${month}-${year}-0001`);
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
    { id_purchase_request_item: 11, decision: "approved", asset_category: "asset" },
    { id_purchase_request_item: 12, decision: "rejected", asset_category: "non asset" },
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

test("GA Purchase Order rejections and item return require a note", async () => {
  await assert.rejects(gaOrderService.action(1, "reject_fat", 5, { note: "" }, false), /note is required/);
  await assert.rejects(gaOrderService.returnItem(1, 11, 5, {}, false), /note is required for return/);
  await assert.rejects(gaOrderService.refundDecision(1, 11, 5, false, { note: " " }, false), /note is required for rejection/);
  await assert.rejects(gaOrderService.action(1, "accept_goods", 5, {}, false), /Invalid action/);
});

function mockGaOrder(t, order, fileCounts = {}, items = []) {
  const originals = {
    transaction: db1.transaction,
    findByPk: models.db1.GaPurchaseOrder.findByPk,
    update: models.db1.GaPurchaseOrder.update,
    progress: models.db1.GaPurchaseOrderVerificationProgress.create,
    count: models.db1.File.count,
    itemFindOne: models.db1.GaPurchaseOrderItem.findOne,
    itemUpdate: models.db1.GaPurchaseOrderItem.update,
    itemCount: models.db1.GaPurchaseOrderItem.count,
    receipt: models.db1.GaPurchaseOrderItemReceipt.create,
    realization: models.db1.GaPurchaseOrderItemRealization.create,
    realizationCount: models.db1.GaPurchaseOrderItemRealization.count,
    getById: gaOrderService.getById,
  };
  t.after(() => {
    db1.transaction = originals.transaction;
    models.db1.GaPurchaseOrder.findByPk = originals.findByPk;
    models.db1.GaPurchaseOrder.update = originals.update;
    models.db1.GaPurchaseOrderVerificationProgress.create = originals.progress;
    models.db1.File.count = originals.count;
    models.db1.GaPurchaseOrderItem.findOne = originals.itemFindOne;
    models.db1.GaPurchaseOrderItem.update = originals.itemUpdate;
    models.db1.GaPurchaseOrderItem.count = originals.itemCount;
    models.db1.GaPurchaseOrderItemReceipt.create = originals.receipt;
    models.db1.GaPurchaseOrderItemRealization.create = originals.realization;
    models.db1.GaPurchaseOrderItemRealization.count = originals.realizationCount;
    gaOrderService.getById = originals.getById;
  });
  const writes = [];
  db1.transaction = async () => ({ LOCK: { UPDATE: "UPDATE" }, commit: async () => {}, rollback: async () => {} });
  models.db1.GaPurchaseOrder.findByPk = async () => order;
  models.db1.GaPurchaseOrder.update = async (data) => { writes.push(["order", data]); Object.assign(order, data); return [1]; };
  models.db1.GaPurchaseOrderVerificationProgress.create = async (data) => {
    writes.push(["progress", data.status, data.id_ga_purchase_order_item]); return { id: 1 };
  };
  models.db1.File.count = async ({ where }) => fileCounts[where.category] ?? 0;
  models.db1.GaPurchaseOrderItem.findOne = async ({ where }) => items.find((item) => item.id === Number(where.id)) || null;
  models.db1.GaPurchaseOrderItem.update = async (data, { where }) => {
    Object.assign(items.find((item) => item.id === where.id), data); return [1];
  };
  models.db1.GaPurchaseOrderItem.count = async ({ where }) =>
    items.filter((item) => where.receiving_status.includes(item.receiving_status)).length;
  models.db1.GaPurchaseOrderItemReceipt.create = async (data) => {
    writes.push(["receipt", data.type, data.quantity_received, data.quantity_good, data.quantity_returned,
      data.return_shipping_cost]);
    return { id: 100 + writes.length, ...data };
  };
  models.db1.GaPurchaseOrderItemRealization.create = async (data) => {
    const item = items.find((row) => row.id === data.id_ga_purchase_order_item);
    item.realizations = [...(item.realizations ?? []), data];
    return { id: 200 + item.realizations.length, ...data };
  };
  models.db1.GaPurchaseOrderItemRealization.count = async ({ where }) =>
    items.find((item) => item.id === where.id_ga_purchase_order_item)?.realizations?.length ?? 0;
  gaOrderService.getById = async () => order;
  return writes;
}

test("GA Purchase Order follows the approval chain up to receiving", async (t) => {
  const order = { status: "request ga manager" };
  mockGaOrder(t, order, { files_payment: 1 });
  for (const [action, status] of [["approve_ga_manager", "request director"], ["approve_director", "request spv/manager fat"],
    ["approve_fat", "request cashier"]]) {
    await gaOrderService.action(1, action, 5, {}, false);
    assert.equal(order.status, status);
  }
  const payment = { payment_amount: 6660000, payment_date: "2026-10-06", payment_note: "Transfer" };
  await assert.rejects(gaOrderService.action(1, "approve_cashier", 5, {}, false), /payment_amount/);
  await assert.rejects(gaOrderService.action(1, "approve_cashier", 5, payment, false), /payment_method/);
  await assert.rejects(gaOrderService.action(1, "approve_cashier", 5,
    { ...payment, payment_method: "petty cash" }, false), /petty_cash_method/);
  await gaOrderService.action(1, "approve_cashier", 5,
    { ...payment, payment_method: "bank", petty_cash_method: "cash" }, false);
  assert.equal(order.status, "request receiving");
  assert.equal(order.payment_amount, 6660000);
  assert.equal(order.payment_method, "bank");
  assert.equal(order.petty_cash_method, null);
  await assert.rejects(gaOrderService.action(1, "approve_fat", 5, {}, false), /not allowed/);
});

test("Cashier petty cash payment records the petty cash method", async (t) => {
  const order = { status: "request cashier" };
  mockGaOrder(t, order, { files_payment: 1 });
  await gaOrderService.action(1, "approve_cashier", 5, { payment_amount: 100, payment_date: "2026-10-06",
    payment_method: "petty cash", petty_cash_method: "transfer" }, false);
  assert.equal(order.petty_cash_method, "transfer");
});

test("Orders left in the old return cycle can still go back to receiving", async (t) => {
  const order = { status: "return request ga manager" };
  const writes = mockGaOrder(t, order);
  await gaOrderService.action(1, "approve_ga_manager", 5, {}, false);
  assert.equal(order.status, "return request cashier");
  await gaOrderService.action(1, "approve_cashier", 5, {}, false);
  assert.equal(order.status, "request receiving");
  assert.deepEqual(writes.filter(([kind]) => kind === "progress").map(([, status]) => status),
    ["return approved ga manager", "return approved cashier"]);
});

const realizationBody = { purchase_realization_date: "2026-10-10", purchase_realization_amount: 3330000 };
const acceptBody = { goods_in_date: "2026-10-12", goods_status: "Good With Notes", note: "Dus penyok" };
const returnBody = {
  goods_in_date: "2026-10-12", goods_status: "Not Good", note: "2 unit rusak",
  return_delivery_date: "2026-10-13", return_shipping_cost: 25000,
};
const allFiles = { files_purchase_proof: 1, files_invoice: 1, files_goods_in: 1, files_goods_receipt: 1,
  files_return_delivery_proof: 1, files_return_waybill: 1, files_refund_proof: 1 };
const receivingItemRow = (id, extra = {}) => ({
  id, id_ga_purchase_order: 1, receiving_status: "pending", return_count: 0, item_category: "item",
  quantity: "5.00", quantity_good: "0.00", quantity_returned: "0.00", quantity_refunded: "0.00",
  realizations: [realizationBody], ...extra,
});

function mockInventory(t) {
  const original = inventoryService.addFromGaPurchaseOrderReceipt;
  t.after(() => { inventoryService.addFromGaPurchaseOrderReceipt = original; });
  const calls = [];
  inventoryService.addFromGaPurchaseOrderReceipt = async (orderId, itemId, receipt) => {
    calls.push([itemId, receipt.type, receipt.quantity_good]);
  };
  return calls;
}

const progressOf = (writes) => writes.filter(([kind]) => kind === "progress").map(([, status, itemId]) => [status, itemId]);

test("GA staff saves the purchase realization before receiving an item; each save is kept", async (t) => {
  const order = { status: "request receiving" };
  const items = [receivingItemRow(11, { realizations: [] })];
  const counts = { files_purchase_proof: 1, files_invoice: 0 };
  const writes = mockGaOrder(t, order, counts, items);
  await assert.rejects(gaOrderService.saveRealization(1, 11, 5, {}, false), /purchase_realization_date is required/);
  await assert.rejects(gaOrderService.saveRealization(1, 11, 5, { ...realizationBody, purchase_realization_amount: "" }, false),
    /purchase_realization_amount/);
  await assert.rejects(gaOrderService.acceptItem(1, 11, 5, { ...acceptBody, quantity_good: 5 }, false),
    /Purchase realization must be saved/);
  await assert.rejects(gaOrderService.saveRealization(1, 11, 5, realizationBody, false), /files_invoice is required/);
  // The mock has no rollback, so drop the row the failed save created.
  items[0].realizations = [];
  counts.files_invoice = 1;
  await gaOrderService.saveRealization(1, 11, 5, { ...realizationBody, note: "Invoice toko" }, false);
  assert.equal(items[0].receiving_status, "pending");
  await gaOrderService.saveRealization(1, 11, 5, { ...realizationBody, purchase_realization_amount: 1332000 }, false);
  assert.deepEqual(items[0].realizations.map((row) => [row.purchase_realization_amount, row.note, row.id_user]),
    [[3330000, "Invoice toko", 5], [1332000, null, 5]]);
  assert.deepEqual(progressOf(writes), [["purchase realization saved", 11], ["purchase realization saved", 11]]);
  // A refund can finish the order; realizations can still be added, receiving cannot.
  order.status = "finished";
  await gaOrderService.saveRealization(1, 11, 5, realizationBody, false);
  assert.equal(items[0].realizations.length, 3);
  await assert.rejects(gaOrderService.acceptItem(1, 11, 5, { ...acceptBody, quantity_good: 5 }, false),
    /order awaits receiving/);
  order.status = "rejected cashier";
  await assert.rejects(gaOrderService.saveRealization(1, 11, 5, realizationBody, false), /order awaits receiving/);
});

test("GA staff return needs a note, the return shipment data and its files", async (t) => {
  const order = { status: "request receiving" };
  const items = [receivingItemRow(11)];
  mockGaOrder(t, order, { ...allFiles, files_return_waybill: 0 }, items);
  await assert.rejects(gaOrderService.returnItem(1, 11, 5, {}, false), /note is required for return/);
  await assert.rejects(gaOrderService.returnItem(1, 11, 5, { ...returnBody, quantity_good: 3, return_delivery_date: "" }, false),
    /return_delivery_date is required/);
  await assert.rejects(gaOrderService.returnItem(1, 11, 5, { ...returnBody, quantity_good: 3, return_shipping_cost: -1 }, false),
    /return_shipping_cost/);
  await assert.rejects(gaOrderService.returnItem(1, 11, 5, { ...returnBody, quantity_good: 5 }, false),
    /less than the outstanding quantity \(5\)/);
  await assert.rejects(gaOrderService.returnItem(1, 11, 5, { ...returnBody, quantity_good: 3 }, false),
    /files_return_waybill is required/);
  await assert.rejects(gaOrderService.acceptItem(1, 11, 5, { ...acceptBody, goods_status: "Good" }, false),
    /goods_status must be one of/);
  await assert.rejects(gaOrderService.acceptItem(1, 11, 5, acceptBody, false), /quantity_good/);
  assert.equal(items[0].receiving_status, "pending");
  await assert.rejects(gaOrderService.returnItem(1, 99, 5, { ...returnBody, quantity_good: 3 }, false), /item not found/);
});

test("Partial return stocks the good quantity; the replacement is accepted later and finishes the order", async (t) => {
  const order = { status: "request receiving" };
  const items = [receivingItemRow(11), receivingItemRow(12, { item_category: "services", quantity: "1.00" })];
  const writes = mockGaOrder(t, order, allFiles, items);
  const inventoryCalls = mockInventory(t);

  await gaOrderService.returnItem(1, 11, 5, { ...returnBody, quantity_good: 3 }, false);
  assert.equal(items[0].receiving_status, "returned");
  assert.equal(items[0].quantity_good, 3);
  assert.equal(items[0].quantity_returned, 2);
  assert.equal(items[0].return_count, 1);
  assert.equal(order.status, "request receiving");

  await assert.rejects(gaOrderService.acceptItem(1, 11, 5, { ...acceptBody, quantity_good: 3 }, false),
    /equal the outstanding quantity \(2\)/);
  await gaOrderService.acceptItem(1, 11, 5, { ...acceptBody, quantity_good: 2 }, false);
  assert.equal(items[0].receiving_status, "accepted");
  assert.equal(items[0].quantity_good, 5);
  assert.equal(items[0].quantity_returned, 0);
  await assert.rejects(gaOrderService.acceptItem(1, 11, 5, { ...acceptBody, quantity_good: 0 }, false), /already been accepted/);
  await assert.rejects(gaOrderService.returnItem(1, 11, 5, { ...returnBody, quantity_good: 0 }, false), /already been accepted/);

  await gaOrderService.acceptItem(1, 12, 5, { ...acceptBody, quantity_good: 1 }, false);
  assert.equal(order.status, "finished");
  assert.deepEqual(writes.filter(([kind]) => kind === "receipt").map(([, ...rest]) => rest),
    [["return", 5, 3, 2, 25000], ["accept", 2, 2, 0, null], ["accept", 1, 1, 0, null]]);
  assert.deepEqual(inventoryCalls, [[11, "return", 3], [11, "accept", 2]]);
  assert.deepEqual(progressOf(writes),
    [["goods returned", 11], ["goods accepted", 11], ["goods accepted", 12], ["finished", null]]);
  await assert.rejects(gaOrderService.acceptItem(1, 12, 5, { ...acceptBody, quantity_good: 1 }, false), /awaits receiving/);
});

test("Returned quantity can be refunded after FAT approval, which finishes the order", async (t) => {
  const order = { status: "request receiving" };
  const items = [
    receivingItemRow(11, { receiving_status: "returned", quantity_good: "3.00", quantity_returned: "2.00", return_count: 1 }),
    receivingItemRow(12, { receiving_status: "accepted", quantity_good: "5.00" }),
    receivingItemRow(13),
  ];
  const counts = { ...allFiles, files_refund_proof: 0 };
  const writes = mockGaOrder(t, order, counts, items);
  const refund = { refund_date: "2026-10-20", refund_amount: 1332000, note: "Toko transfer balik" };
  const received = { refund_received_date: "2026-10-22" };

  await assert.rejects(gaOrderService.requestRefund(1, 13, 5, refund, false), /while the item is pending/);
  await assert.rejects(gaOrderService.requestRefund(1, 11, 5, { ...refund, refund_amount: 0 }, false), /refund_amount must be a positive/);
  await assert.rejects(gaOrderService.requestRefund(1, 11, 5, refund, false), /files_refund_proof is required/);
  counts.files_refund_proof = 1;
  await assert.rejects(gaOrderService.refundDecision(1, 11, 5, true, received, false), /while the item is returned/);
  await gaOrderService.requestRefund(1, 11, 5, refund, false);
  assert.equal(items[0].receiving_status, "refund requested");
  assert.equal(items[0].refund_amount, 1332000);
  await assert.rejects(gaOrderService.acceptItem(1, 11, 5, { ...acceptBody, quantity_good: 2 }, false),
    /while the item is refund requested/);

  await assert.rejects(gaOrderService.refundDecision(1, 11, 7, false, {}, false), /note is required for rejection/);
  await gaOrderService.refundDecision(1, 11, 7, false, { note: "Bukti kurang jelas" }, false);
  assert.equal(items[0].receiving_status, "returned");
  await gaOrderService.requestRefund(1, 11, 5, refund, false);
  await assert.rejects(gaOrderService.refundDecision(1, 11, 7, true, {}, false), /refund_received_date is required/);
  await assert.rejects(gaOrderService.refundDecision(1, 11, 7, true, received, false),
    /files_refund_received_proof is required/);
  assert.equal(items[0].receiving_status, "refund requested");
  counts.files_refund_received_proof = 1;
  await gaOrderService.refundDecision(1, 11, 7, true, received, false);
  assert.equal(items[0].receiving_status, "refunded");
  assert.equal(items[0].refund_received_date, "2026-10-22");
  assert.equal(items[0].quantity_refunded, 2);
  assert.equal(items[0].quantity_returned, 0);
  assert.equal(order.status, "request receiving");
  await assert.rejects(gaOrderService.requestRefund(1, 11, 5, refund, false), /settled with a refund/);

  mockInventory(t);
  await gaOrderService.acceptItem(1, 13, 5, { ...acceptBody, quantity_good: 5 }, false);
  assert.equal(order.status, "finished");
  assert.deepEqual(progressOf(writes), [["refund requested", 11], ["refund rejected spv/manager fat", 11],
    ["refund requested", 11], ["refund approved spv/manager fat", 11], ["goods accepted", 13], ["finished", null]]);
});

test("Order totals are the sums of the item values", async (t) => {
  const originals = { findAll: models.db1.GaPurchaseOrderItem.findAll, update: models.db1.GaPurchaseOrder.update };
  t.after(() => {
    models.db1.GaPurchaseOrderItem.findAll = originals.findAll;
    models.db1.GaPurchaseOrder.update = originals.update;
  });
  let attributes;
  models.db1.GaPurchaseOrderItem.findAll = async (options) => {
    attributes = options.attributes;
    return [
      { sub_total: "1000000.00", ppn: "110000", pph: "20000", pp_20: "0", pph_4_ayat_2: "0", total: "1090000.00" },
      { sub_total: "500000.10", ppn: "55000", pph: "0", pp_20: "2500", pph_4_ayat_2: "10000", total: "542500.10" },
    ];
  };
  let totals;
  models.db1.GaPurchaseOrder.update = async (data) => { totals = data; return [1]; };
  await gaOrderService.updateTotals(1, {});
  assert.deepEqual(attributes, ["sub_total", "ppn", "pph", "pp_20", "pph_4_ayat_2", "total"]);
  assert.deepEqual(totals, { sub_total: 1500000.1, ppn: 165000, pph: 20000, pp_20: 2500, pph_4_ayat_2: 10000, total: 1632500.1 });
});

test("Returned item list only includes items returned at least once", async (t) => {
  const original = models.db1.GaPurchaseOrderItem.findAll;
  t.after(() => { models.db1.GaPurchaseOrderItem.findAll = original; });
  let options;
  models.db1.GaPurchaseOrderItem.findAll = async (value) => { options = value; return []; };
  await gaOrderService.getReturnedItems({ receiving_status: "returned" }, { id_company: 2 });
  assert.equal(options.where.receiving_status, "returned");
  assert.equal(options.where.return_count[Op.gt], 0);
  assert.deepEqual(options.include[0].where, { id_company: 2 });
  assert.ok(options.include.some((include) => include.as === "receipts"));
});

test("Returned item search matches the item name or the GA purchase order number", async (t) => {
  const originals = { items: models.db1.GaPurchaseOrderItem.findAll, orders: models.db1.GaPurchaseOrder.findAll };
  t.after(() => {
    models.db1.GaPurchaseOrderItem.findAll = originals.items;
    models.db1.GaPurchaseOrder.findAll = originals.orders;
  });
  let orderWhere;
  let options;
  models.db1.GaPurchaseOrder.findAll = async (value) => { orderWhere = value.where; return [{ id: 4 }, { id: 9 }]; };
  models.db1.GaPurchaseOrderItem.findAll = async (value) => { options = value; return []; };
  await gaOrderService.getReturnedItems({}, {}, null, null, "GAPO-TYS");
  assert.deepEqual(orderWhere.ga_purchase_order_no, { [Op.like]: "%GAPO-TYS%" });
  assert.deepEqual(options.where[Op.or], [
    { item_name: { [Op.like]: "%GAPO-TYS%" } },
    { id_ga_purchase_order: [4, 9] },
  ]);
  assert.equal(options.where.return_count[Op.gt], 0);
});

test("Accepted goods add quantity to a matching inventory row or create a new one", async (t) => {
  const originals = {
    itemFindOne: models.db1.GaPurchaseOrderItem.findOne,
    findOne: models.db1.Inventory.findOne,
    invUpdate: models.db1.Inventory.update,
    invCreate: models.db1.Inventory.create,
    history: models.db1.InventoryHistory.create,
    files: models.db1.File.findAll,
    fileCreate: models.db1.File.create,
  };
  t.after(() => {
    models.db1.GaPurchaseOrderItem.findOne = originals.itemFindOne;
    models.db1.Inventory.findOne = originals.findOne;
    models.db1.Inventory.update = originals.invUpdate;
    models.db1.Inventory.create = originals.invCreate;
    models.db1.InventoryHistory.create = originals.history;
    models.db1.File.findAll = originals.files;
    models.db1.File.create = originals.fileCreate;
  });
  const file = (stored_name) => ({ stored_name, original_name: stored_name, url: "/files/" + stored_name, mime_type: "image/png", size: 1 });
  const items = [
    { id: 21, item_name: "Printer", brand: "HP", serial_number: "M404dn", size: "", material: null, other: null,
      quantity_unit: "unit", quantity: "2.00", purchase_request_category: "Office", asset_category: "asset", files_product: [file("a.png"), file("b.png")] },
    { id: 22, item_name: "Printer", brand: "Canon", serial_number: null, size: null, material: null, other: null,
      quantity_unit: "unit", quantity: "1.00", purchase_request_category: "Office", asset_category: "non asset", files_product: [] },
  ];
  models.db1.GaPurchaseOrderItem.findOne = async ({ where }) => items.find((item) => item.id === where.id);
  const wheres = [];
  models.db1.Inventory.findOne = async ({ where }) => {
    wheres.push(where);
    return where[Op.and].some((cond) => cond.brand === "HP") ? { id: 7, quantity: "3.00" } : null;
  };
  const writes = [];
  models.db1.Inventory.update = async (data, { where }) => { writes.push(["update", where.id, data.quantity, data.asset_category]); return [1]; };
  models.db1.Inventory.create = async (data) => {
    writes.push(["create", data.brand, data.quantity, data.asset_category, data.received_date]); return { id: 8 };
  };
  models.db1.InventoryHistory.create = async (data) => {
    writes.push(["history", data.id_inventory, data.id_ga_purchase_order_item, data.id_ga_purchase_order_item_receipt,
      data.quantity, data.received_date]);
    return {};
  };
  models.db1.File.findAll = async () => [{ stored_name: "a.png" }];
  models.db1.File.create = async (data) => { writes.push(["file", data.fileable_id, data.stored_name]); return {}; };

  const t1 = { LOCK: { UPDATE: "UPDATE" } };
  await inventoryService.addFromGaPurchaseOrderReceipt(1, 21,
    { id: 31, type: "return", quantity_good: 2, goods_in_date: "2026-10-12" }, 5, t1);
  await inventoryService.addFromGaPurchaseOrderReceipt(1, 22,
    { id: 32, type: "accept", quantity_good: 1, goods_in_date: "2026-10-14" }, 5, t1);

  assert.deepEqual(wheres[0][Op.and].slice(0, 3), [{ item_name: "Printer" }, { brand: "HP" }, { serial_number: "M404dn" }]);
  assert.deepEqual(wheres[0][Op.and][3], { [Op.or]: [{ size: null }, { size: "" }] });
  assert.deepEqual(writes, [
    ["update", 7, 5, "asset"], ["history", 7, 21, 31, 2, "2026-10-12"], ["file", 7, "b.png"],
    ["create", "Canon", 1, "non asset", "2026-10-14"], ["history", 8, 22, 32, 1, "2026-10-14"],
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

test("GA approval requires asset_category for every item decision", async (t) => {
  const transaction = db1.transaction;
  const findRequest = models.db1.PurchaseRequest.findByPk;
  const findItems = models.db1.PurchaseRequestItem.findAll;
  t.after(() => {
    db1.transaction = transaction;
    models.db1.PurchaseRequest.findByPk = findRequest;
    models.db1.PurchaseRequestItem.findAll = findItems;
  });
  db1.transaction = async () => ({ LOCK: { UPDATE: "UPDATE" }, rollback: async () => {} });
  models.db1.PurchaseRequest.findByPk = async () => ({ status: "request ga" });
  models.db1.PurchaseRequestItem.findAll = async () => [{ id: 11 }];
  await assert.rejects(purchaseRequestService.action(1, "approve_ga", 5, null,
    [{ id_purchase_request_item: 11, decision: "approved" }], false), /asset_category/);
});

test("Inventory stock check matches every field and returns 0 when nothing matches", async (t) => {
  const findOne = models.db1.Inventory.findOne;
  t.after(() => { models.db1.Inventory.findOne = findOne; });
  let where;
  models.db1.Inventory.findOne = async (options) => { where = options.where; return null; };
  assert.deepEqual(await inventoryService.checkStock({ item_name: "Printer", brand: "HP" }),
    { id_inventory: null, quantity: 0, quantity_unit: null });
  assert.deepEqual(where[Op.and].slice(0, 2), [{ item_name: "Printer" }, { brand: "HP" }]);
  assert.deepEqual(where[Op.and][2], { [Op.or]: [{ serial_number: null }, { serial_number: "" }] });

  models.db1.Inventory.findOne = async () => ({ id: 7, quantity: "3.00", quantity_unit: "unit" });
  assert.deepEqual(await inventoryService.checkStock({ item_name: "Printer", brand: "HP" }),
    { id_inventory: 7, quantity: 3, quantity_unit: "unit" });
});

const inventoryRequestService = require("../src/services/inventory/inventoryRequest.service");

function mockInventoryRequest(t, request) {
  const originals = {
    transaction: db1.transaction,
    findOne: models.db1.InventoryRequest.findOne,
    update: models.db1.InventoryRequest.update,
    progress: models.db1.InventoryRequestVerificationProgress.create,
    addStock: inventoryService.addFromInventoryRequest,
    getById: inventoryRequestService.getById,
  };
  t.after(() => {
    db1.transaction = originals.transaction;
    models.db1.InventoryRequest.findOne = originals.findOne;
    models.db1.InventoryRequest.update = originals.update;
    models.db1.InventoryRequestVerificationProgress.create = originals.progress;
    inventoryService.addFromInventoryRequest = originals.addStock;
    inventoryRequestService.getById = originals.getById;
  });
  const writes = [];
  db1.transaction = async () => ({ LOCK: { UPDATE: "UPDATE" }, commit: async () => {}, rollback: async () => {} });
  models.db1.InventoryRequest.findOne = async () => request;
  models.db1.InventoryRequest.update = async (data) => { writes.push(["request", data]); Object.assign(request, data); return [1]; };
  models.db1.InventoryRequestVerificationProgress.create = async (data) => { writes.push(["progress", data.status, data.note]); return {}; };
  inventoryService.addFromInventoryRequest = async (id) => { writes.push(["stock", id]); return 7; };
  inventoryRequestService.getById = async () => request;
  return writes;
}

test("Approving an inventory request adds stock once and links the inventory row", async (t) => {
  const request = { id: 3, status: "pending", id_user_request: 5 };
  const writes = mockInventoryRequest(t, request);
  await inventoryRequestService.approve(3, 9, "OK", false);
  assert.equal(request.status, "approve");
  assert.equal(request.id_inventory, 7);
  assert.deepEqual(writes, [["stock", 3], ["request", { status: "approve", id_inventory: 7 }], ["progress", "approve", "OK"]]);
  await assert.rejects(inventoryRequestService.approve(3, 9, null, false), /already approve/);
  await assert.rejects(inventoryRequestService.reject(3, 9, "x", false), /already approve/);
  await assert.rejects(inventoryRequestService.update(3, { quantity: 2 }, 5, false), /already approve/);
});

test("Rejecting an inventory request needs a note and adds no stock", async (t) => {
  const request = { id: 4, status: "pending", id_user_request: 5 };
  const writes = mockInventoryRequest(t, request);
  await assert.rejects(inventoryRequestService.reject(4, 9, " ", false), /note is required/);
  await inventoryRequestService.reject(4, 9, "Barang tidak ada", false);
  assert.equal(request.status, "reject");
  assert.deepEqual(writes, [["request", { status: "reject" }], ["progress", "reject", "Barang tidak ada"]]);
});

test("Only the creator can edit a pending inventory request", async (t) => {
  const request = { id: 5, status: "pending", id_user_request: 5 };
  const writes = mockInventoryRequest(t, request);
  await assert.rejects(inventoryRequestService.update(5, { quantity: 2 }, 8, false), /Only the creator/);
  await inventoryRequestService.update(5, { quantity: 2, status: "approve", id_user_request: 8 }, 5, false);
  assert.deepEqual(writes[0], ["request", { quantity: 2 }]);
  assert.equal(request.status, "pending");
});

test("Bulk create makes one pending request per item in one transaction", async (t) => {
  const originals = {
    transaction: db1.transaction,
    create: models.db1.InventoryRequest.create,
    findAll: models.db1.InventoryRequest.findAll,
    progress: models.db1.InventoryRequestVerificationProgress.create,
  };
  t.after(() => {
    db1.transaction = originals.transaction;
    models.db1.InventoryRequest.create = originals.create;
    models.db1.InventoryRequest.findAll = originals.findAll;
    models.db1.InventoryRequestVerificationProgress.create = originals.progress;
  });
  let transactions = 0;
  let rolledBack = false;
  db1.transaction = async () => {
    transactions++;
    return { LOCK: { UPDATE: "UPDATE" }, commit: async () => {}, rollback: async () => { rolledBack = true; } };
  };
  const created = [];
  models.db1.InventoryRequest.create = async (data) => {
    if (data.item_name === "Gagal") throw new Error("insert failed");
    created.push(data);
    return { id: 40 + created.length };
  };
  const progress = [];
  models.db1.InventoryRequestVerificationProgress.create = async (data) => { progress.push(data.id_inventory_request); return {}; };
  let findWhere;
  models.db1.InventoryRequest.findAll = async (options) => {
    findWhere = options.where;
    return options.where.id.map((id) => ({ toJSON: () => ({ id, status: "pending" }) }));
  };

  const result = await inventoryRequestService.createMany([
    { item_name: "Kursi", quantity_unit: "unit", quantity: 2, received_date: "2026-10-20", status: "approve" },
    { item_name: "Meja", quantity_unit: "unit", quantity: 1, received_date: "2026-10-21" },
  ], 5, false);
  assert.equal(transactions, 1);
  assert.deepEqual(created.map((data) => [data.item_name, data.status, data.id_user_request, data.received_date]),
    [["Kursi", "pending", 5, "2026-10-20"], ["Meja", "pending", 5, "2026-10-21"]]);
  assert.deepEqual(progress, [41, 42]);
  assert.deepEqual(findWhere.id, [41, 42]);
  assert.deepEqual(result.map((row) => row.id), [41, 42]);

  await assert.rejects(inventoryRequestService.createMany([
    { item_name: "Lemari", quantity_unit: "unit", quantity: 1 },
    { item_name: "Gagal", quantity_unit: "unit", quantity: 1 },
  ], 5, false), /insert failed/);
  assert.equal(rolledBack, true);
});

test("Inventory request create requires a valid received_date; edit only checks it when sent", async (t) => {
  const controller = require("../src/controllers/inventory/inventoryRequest.controller");
  const originals = { create: inventoryRequestService.create, update: inventoryRequestService.update };
  t.after(() => Object.assign(inventoryRequestService, originals));
  inventoryRequestService.create = async (body) => body;
  inventoryRequestService.update = async (id, body) => body;
  const call = async (method, body) => {
    const res = { status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } };
    await controller[method]({ body, params: { id: 1 }, user: { id: 5 } }, res);
    return [res.code, res.payload.message];
  };
  const body = { item_name: "Kursi", quantity_unit: "unit", quantity: 2 };
  assert.deepEqual(await call("create", body), [400, "received_date must be a valid date"]);
  assert.deepEqual(await call("create", { ...body, received_date: "bukan tanggal" }), [400, "received_date must be a valid date"]);
  assert.equal((await call("create", { ...body, received_date: "2026-10-20" }))[0], 201);
  assert.equal((await call("update", { quantity: 3 }))[0], 200);
  assert.deepEqual(await call("update", { received_date: "" }), [400, "received_date must be a valid date"]);
});

test("Approved inventory request stock carries its received_date to the new inventory row and history", async (t) => {
  const originals = {
    findByPk: models.db1.InventoryRequest.findByPk,
    findOne: models.db1.Inventory.findOne,
    create: models.db1.Inventory.create,
    history: models.db1.InventoryHistory.create,
  };
  t.after(() => {
    models.db1.InventoryRequest.findByPk = originals.findByPk;
    models.db1.Inventory.findOne = originals.findOne;
    models.db1.Inventory.create = originals.create;
    models.db1.InventoryHistory.create = originals.history;
  });
  models.db1.InventoryRequest.findByPk = async () => ({ id: 3, item_name: "Kursi", quantity_unit: "unit",
    quantity: "2.00", received_date: "2026-10-20", note: null, files_product: [] });
  models.db1.Inventory.findOne = async () => null;
  const writes = [];
  models.db1.Inventory.create = async (data) => { writes.push(["create", data.received_date]); return { id: 9 }; };
  models.db1.InventoryHistory.create = async (data) => {
    writes.push(["history", data.id_inventory_request, data.received_date]); return {};
  };
  assert.equal(await inventoryService.addFromInventoryRequest(3, 5, { LOCK: { UPDATE: "UPDATE" } }), 9);
  assert.deepEqual(writes, [["create", "2026-10-20"], ["history", 3, "2026-10-20"]]);
});
