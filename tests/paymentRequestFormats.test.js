const test = require("node:test");
const assert = require("node:assert/strict");
const controller = require("../src/controllers/paymentRequest/paymentRequest.controller");
const service = require("../src/services/paymentRequest/paymentRequest.service");
const companyService = require("../src/services/company.service");
const { models } = require("../src/models");
const { Op } = require("sequelize");

function response() {
  return {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return body; },
  };
}

const baseExpense = {
  payment_request_no: "PR-1",
  payment_type: "others",
  priority: "normal",
  cost_bearer: "company",
  id_company: 1,
  payment_date: "2026-09-30",
  total_payment: 110,
  sub_total_payment: 100,
  tax_ppn: true,
  tax_pph_23: false,
  tax_pp_20: true,
  tax_pph_4_ayat_2: false,
  ppn: 10,
  pph: 0,
  pp_20: 1,
  pph_4_ayat_2: 0,
  bank_name: "Bank A",
  account_name: "Account A",
  account_number: "123",
  description: "Expenses",
  expenses: [{ purchase_date: "2026-09-29", category: "Travel", description: "Taxi", vendor: "Vendor A", total: 100, files: [] }],
};

test("expense create maps the requested amount and keeps expense items separate", async (t) => {
  const original = service.createWithRelations;
  t.after(() => { service.createWithRelations = original; });
  let args;
  service.createWithRelations = async (...values) => { args = values; return { id: 1 }; };
  const res = response();
  await controller.createExpense({ body: baseExpense, user: { id: 7, id_department: 8 } }, res);
  assert.equal(res.code, 201);
  assert.equal(args[0].request_format, "expense");
  assert.equal(args[0].total_payment_request, 110);
  assert.equal(args[0].tax_ppn, true);
  assert.equal(args[0].tax_pp_20, true);
  assert.equal(args[0].pp_20, 1);
  assert.equal(args[0].vendor_name, null);
  assert.deepEqual(args[4], baseExpense.expenses);
});

const TOP_UP = "top up petty cash";
const { expenses: _items, payment_type: _type, ...baseTopUp } = baseExpense;

test("top up petty cash create has its own format and takes no expense items", async (t) => {
  const original = service.createWithRelations;
  t.after(() => { service.createWithRelations = original; });
  let args;
  service.createWithRelations = async (...values) => { args = values; return { id: 1 }; };
  const user = { id: 7, id_department: 8 };

  const res = response();
  await controller.createTopUpPettyCash({ body: { ...baseTopUp, payment_type: "vendor" }, user }, res);
  assert.equal(res.code, 201);
  assert.equal(args[0].request_format, TOP_UP);
  assert.equal(args[0].payment_type, TOP_UP);
  assert.equal(args[0].top_up_petty_cash, 110);
  assert.deepEqual(args[4], undefined);

  const withItems = response();
  await controller.createTopUpPettyCash({ body: { ...baseTopUp, expenses: baseExpense.expenses }, user }, withItems);
  assert.equal(withItems.code, 400);
  assert.match(withItems.body.message, /only supported for expense/);

  const { bank_name, ...missingBank } = baseTopUp;
  const incomplete = response();
  await controller.createTopUpPettyCash({ body: missingBank, user }, incomplete);
  assert.equal(incomplete.code, 400);
  assert.match(incomplete.body.message, /bank_name is required/);

  for (const create of [controller.createExpense, controller.create, controller.createPjt]) {
    const misrouted = response();
    await create({ body: { ...baseStandard, ...baseExpense, payment_type: TOP_UP }, user }, misrouted);
    assert.equal(misrouted.code, 400);
    assert.match(misrouted.body.message, /top-up-petty-cash endpoint/);
  }
});

test("top up petty cash update keeps the amount in step and rejects other formats", async (t) => {
  const originalFind = service.findById;
  const originalUpdate = service.updateWithRelations;
  t.after(() => { service.findById = originalFind; service.updateWithRelations = originalUpdate; });
  let existing = { request_format: TOP_UP, payment_type: TOP_UP, total_payment_request: "110.00" };
  service.findById = async () => existing;
  let args;
  service.updateWithRelations = async (...values) => { args = values; return { id: 1 }; };
  const update = async (body, method = controller.updateTopUpPettyCash) => {
    const res = response();
    await method({ params: { id: 1 }, body, user: { id: 7 } }, res);
    return res;
  };

  assert.equal((await update({ total_payment: 250, payment_type: "vendor" })).code, 200);
  assert.equal(args[1].top_up_petty_cash, 250);
  assert.equal(args[1].total_payment_request, 250);
  assert.equal(args[1].payment_type, TOP_UP);
  assert.equal(args[3], undefined);
  assert.equal((await update({ description: "Updated" })).code, 200);
  assert.equal(args[1].top_up_petty_cash, 110);
  assert.equal((await update({ expenses: [] })).code, 400);

  existing = { request_format: "expense", payment_type: "others", total_payment_request: "110.00" };
  assert.equal((await update({ description: "Updated" })).code, 400);
  assert.equal((await update({ payment_type: TOP_UP }, controller.updateExpense)).code, 400);
});

test("top up petty cash goes from manager FAT straight to the cashier", async (t) => {
  const { db1 } = require("../src/models");
  const progress = models.db1.PaymentRequestVerificationProgress;
  const originals = {
    getById: service.getById, update: service.Model1.update, create: progress.create, transaction: db1.transaction,
  };
  t.after(() => {
    service.getById = originals.getById;
    service.Model1.update = originals.update;
    progress.create = originals.create;
    db1.transaction = originals.transaction;
  });
  let paymentType = TOP_UP;
  let updated;
  let logged;
  service.getById = async () => ({ payment_type: paymentType, cost_bearer: "company" });
  service.Model1.update = async (values) => { updated = values; return [1]; };
  progress.create = async (values) => { logged = values; return values; };
  db1.transaction = async () => ({ commit: async () => {}, rollback: async () => {} });
  const approve = (role) => service.approvePaymentRequest(role, 1, undefined, 7, false);

  await approve("manager fat");
  assert.equal(updated.status, "approve director");
  assert.equal(logged.status, "approve manager fat");
  assert.equal(logged.note, "Payment request approve manager fat");

  await approve("fat");
  assert.equal(updated.status, "approve fat");
  assert.equal(logged.status, "approve fat");

  paymentType = "others";
  await approve("manager fat");
  assert.equal(updated.status, "approve manager fat");
  assert.equal(logged.status, "approve manager fat");
});

test("approve keeps both databases in sync when cost_bearer is empty", async (t) => {
  const originalFind = service.findById;
  const originalApprove = service.approvePaymentRequest;
  t.after(() => { service.findById = originalFind; service.approvePaymentRequest = originalApprove; });
  service.findById = async () => ({ id: 1, cost_bearer: null });
  let args;
  service.approvePaymentRequest = async (...values) => { args = values; return { id: 1 }; };

  const res = response();
  await controller.approve({ params: { id: 1 }, body: { role: "fat" }, user: { id: 7 } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(args, ["fat", 1, undefined, 7, true]);
});

test("expense create rejects incomplete expense items", async () => {
  const res = response();
  await controller.createExpense({
    body: { ...baseExpense, expenses: [{ ...baseExpense.expenses[0], total: -1 }] },
    user: { id: 7 },
  }, res);
  assert.equal(res.code, 400);
  assert.match(res.body.message, /expenses\[0\]\.total/);
});

test("each update endpoint accepts only its matching format", async (t) => {
  const originalFind = service.findById;
  const originalUpdate = service.updateWithRelations;
  t.after(() => { service.findById = originalFind; service.updateWithRelations = originalUpdate; });
  service.findById = async () => ({ request_format: "expense" });
  let calls = 0;
  service.updateWithRelations = async () => { calls++; return { id: 1 }; };
  const req = { params: { id: 1 }, body: { description: "Updated" }, user: { id: 7 } };
  const legacyRes = response();
  await controller.update(req, legacyRes);
  assert.equal(legacyRes.code, 400);
  const expenseRes = response();
  await controller.updateExpense(req, expenseRes);
  assert.equal(expenseRes.code, 200);
  assert.equal(calls, 1);
});

test("next payment request number is grouped by company and resets each year", async (t) => {
  const originalRequests = models.db1.PaymentRequest.findAll;
  const originalCompanies = companyService.findAll;
  t.after(() => {
    models.db1.PaymentRequest.findAll = originalRequests;
    companyService.findAll = originalCompanies;
  });
  let query;
  models.db1.PaymentRequest.findAll = async (options) => {
    query = options;
    return [{ id_company: 1, total: "4" }];
  };
  companyService.findAll = async () => [
    { id: 1, company_name: "Company A", initial_company: "tyscg" },
    { id: 2, company_name: "Company B", initial_company: "cb" },
  ];

  const result = await service.getNoPaymentRequest(true);
  const now = new Date();
  const year = now.getFullYear();
  assert.equal(query.where.is_active, true);
  assert.equal(query.where.createdAt[Op.gte].getFullYear(), year);
  assert.equal(query.where.createdAt[Op.lt].getFullYear(), year + 1);
  assert.deepEqual(query.group, ["id_company"]);
  assert.equal(result[0].next_number, "00005");
  assert.equal(result[0].no_payment_request, `PRQ-TYSCG-${year}-00005`);
  assert.equal(result[1].no_payment_request, `PRQ-CB-${year}-00001`);
});

test("payment request services are typed vendor or manual and fill from vendor service", async (t) => {
  const { models } = require("../src/models");
  const service = require("../src/services/paymentRequest/paymentRequest.service");
  const model = models.db1.PaymentRequestService;
  const originals = {
    findAll: model.findAll, create: model.create, destroy: model.destroy,
    vendorService: models.db1.VendorService.findByPk,
  };
  t.after(() => {
    model.findAll = originals.findAll;
    model.create = originals.create;
    model.destroy = originals.destroy;
    models.db1.VendorService.findByPk = originals.vendorService;
  });
  const created = [];
  const destroyed = [];
  model.findAll = async () => [{ id: 9 }];
  model.create = async (data) => { created.push(data); return { id: created.length }; };
  model.destroy = async ({ where }) => { destroyed.push(where.id); };
  models.db1.VendorService.findByPk = async () => ({
    id_vendor: 4, id_category: 2, service_name: "Cleaning", price_idr: "500000", price_rmb: "0",
  });

  await service.syncServices(1, [
    { id_vendor_service: 3 },
    { id_vendor: 4, service_name: "Repair", price_idr: 100000 },
    { service_name: " Parkir ", price_idr: 20000 },
  ], false, {}, null);

  assert.deepEqual(created.map(({ type, id_vendor, service_name, price_idr, price_rmb }) =>
    ({ type, id_vendor, service_name, price_idr, price_rmb })), [
    { type: "vendor", id_vendor: 4, service_name: "Cleaning", price_idr: "500000", price_rmb: "0" },
    { type: "vendor", id_vendor: 4, service_name: "Repair", price_idr: 100000, price_rmb: 0 },
    { type: "manual", id_vendor: null, service_name: "Parkir", price_idr: 20000, price_rmb: 0 },
  ]);
  assert.deepEqual(destroyed, [9]);
  await assert.rejects(service.syncServices(1, [{ id_vendor_service: 3, id_vendor: 5 }], false, {}, null),
    /does not match the vendor service/);
});

const baseStandard = {
  payment_request_no: "PRQ-1",
  payment_type: "vendor",
  priority: "normal",
  payment_date: "2026-10-13",
  vendor_name: "Vendor A",
  invoice_no: "INV-1",
  total_payment_request: 100,
  description: "PJT",
};

function mockEmployee(t) {
  const original = models.db1.Employee.findByPk;
  t.after(() => { models.db1.Employee.findByPk = original; });
  models.db1.Employee.findByPk = async (id) => (Number(id) === 12 ? { id: 12, full_name: "Budi Santoso" } : null);
}

test("PJT create uses the standard rules plus pjt_type and optional id_employee", async (t) => {
  const original = service.createWithRelations;
  t.after(() => { service.createWithRelations = original; });
  let args;
  service.createWithRelations = async (...values) => { args = values; return { id: 1 }; };
  const user = { id: 7, id_department: 8 };
  const services = [{ id_vendor_item: 5 }];
  mockEmployee(t);

  const res = response();
  await controller.createPjt({ body: { ...baseStandard, pjt_type: "external", id_employee: "12", services }, user }, res);
  assert.equal(res.code, 201);
  assert.equal(args[0].request_format, "pjt");
  assert.equal(args[0].pjt_type, "external");
  assert.equal(args[0].id_employee, 12);
  assert.equal(args[0].employee_name, "Budi Santoso");
  assert.deepEqual(args[5], services);

  const named = response();
  await controller.createPjt({ body: { ...baseStandard, pjt_type: "internal", id_employee: 12, employee_name: " Budi S. " }, user }, named);
  assert.equal(named.code, 201);
  assert.equal(args[0].employee_name, "Budi S.");

  const noEmployee = response();
  await controller.createPjt({ body: { ...baseStandard, pjt_type: "external", employee_name: "Andi (luar)" }, user }, noEmployee);
  assert.equal(noEmployee.code, 201);
  assert.equal(args[0].id_employee, undefined);
  assert.equal(args[0].employee_name, "Andi (luar)");

  const { invoice_no, ...withoutInvoice } = baseStandard;
  const noInvoice = response();
  await controller.createPjt({ body: { ...withoutInvoice, pjt_type: "internal" }, user }, noInvoice);
  assert.equal(noInvoice.code, 201);
  assert.equal(args[0].invoice_no, undefined);

  for (const [body, message] of [
    [{ ...baseStandard, id_employee: 12 }, /pjt_type must be internal or external/],
    [{ ...baseStandard, pjt_type: "internal", id_employee: "abc" }, /id_employee must be a positive integer/],
    [{ ...baseStandard, pjt_type: "internal", id_employee: 99 }, /Employee 99 not found/],
    [{ ...baseStandard, pjt_type: "internal", id_employee: 12, description: "" }, /description is required/],
    [{ ...baseStandard, pjt_type: "internal", id_employee: 12, services: [{ id_vendor_service: 1, id_vendor_item: 2 }] },
      /cannot have both id_vendor_service and id_vendor_item/],
  ]) {
    const invalid = response();
    await controller.createPjt({ body, user }, invalid);
    assert.equal(invalid.code, 400);
    assert.match(invalid.body.message, message);
  }

  const standardNoInvoice = response();
  await controller.create({ body: withoutInvoice, user }, standardNoInvoice);
  assert.equal(standardNoInvoice.code, 400);
  assert.match(standardNoInvoice.body.message, /invoice_no is required/);

  const standard = response();
  await controller.create({ body: { ...baseStandard, pjt_type: "external", id_employee: 12 }, user }, standard);
  assert.equal(standard.code, 201);
  assert.equal(args[0].request_format, "standard");
  assert.equal(args[0].pjt_type, undefined);
  assert.equal(args[0].id_employee, undefined);
  assert.equal(args[0].employee_name, undefined);
});

test("PJT update endpoint accepts only PJT requests and validates PJT fields", async (t) => {
  const originalFind = service.findById;
  const originalUpdate = service.updateWithRelations;
  t.after(() => { service.findById = originalFind; service.updateWithRelations = originalUpdate; });
  let format = "pjt";
  mockEmployee(t);
  service.findById = async () => ({ request_format: format });
  let data;
  service.updateWithRelations = async (id, values) => { data = values; return { id }; };
  const user = { id: 7 };

  const ok = response();
  await controller.updatePjt({ params: { id: 1 }, body: { pjt_type: "internal" }, user }, ok);
  assert.equal(ok.code, 200);
  assert.deepEqual(data, { pjt_type: "internal" });

  const employee = response();
  await controller.updatePjt({ params: { id: 1 }, body: { id_employee: 12 }, user }, employee);
  assert.equal(employee.code, 200);
  assert.deepEqual(data, { id_employee: 12, employee_name: "Budi Santoso" });

  const renamed = response();
  await controller.updatePjt({ params: { id: 1 }, body: { employee_name: "Budi S." }, user }, renamed);
  assert.deepEqual(data, { employee_name: "Budi S." });

  const cleared = response();
  await controller.updatePjt({ params: { id: 1 }, body: { id_employee: null }, user }, cleared);
  assert.equal(cleared.code, 200);
  assert.deepEqual(data, { id_employee: null });

  const invalid = response();
  await controller.updatePjt({ params: { id: 1 }, body: { id_employee: 0 }, user }, invalid);
  assert.equal(invalid.code, 400);

  format = "standard";
  const wrongFormat = response();
  await controller.updatePjt({ params: { id: 1 }, body: { pjt_type: "internal" }, user }, wrongFormat);
  assert.equal(wrongFormat.code, 400);
});

test("payment request services can link to a vendor item", async (t) => {
  const model = models.db1.PaymentRequestService;
  const originals = { findAll: model.findAll, create: model.create, item: models.db1.VendorItem.findByPk };
  t.after(() => {
    model.findAll = originals.findAll;
    model.create = originals.create;
    models.db1.VendorItem.findByPk = originals.item;
  });
  const created = [];
  model.findAll = async () => [];
  model.create = async (data) => { created.push(data); return { id: created.length }; };
  models.db1.VendorItem.findByPk = async () => ({ id_vendor: 4, item_name: "Kertas A4", price_idr: "50000", price_rmb: "0" });

  await service.syncServices(1, [{ id_vendor_item: 5 }, { id_vendor_item: 5, service_name: "Kertas F4", price_idr: 60000 }], false, {}, null);
  assert.deepEqual(created.map(({ type, id_vendor, id_vendor_item, service_name, price_idr }) =>
    ({ type, id_vendor, id_vendor_item, service_name, price_idr })), [
    { type: "vendor", id_vendor: 4, id_vendor_item: 5, service_name: "Kertas A4", price_idr: "50000" },
    { type: "vendor", id_vendor: 4, id_vendor_item: 5, service_name: "Kertas F4", price_idr: 60000 },
  ]);
  await assert.rejects(service.syncServices(1, [{ id_vendor_item: 5, id_vendor: 9 }], false, {}, null),
    /does not match the vendor item/);
  await assert.rejects(service.syncServices(1, [{ id_vendor_item: 5, id_vendor_service: 3 }], false, {}, null),
    /cannot have both/);
});
