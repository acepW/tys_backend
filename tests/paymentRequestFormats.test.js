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
