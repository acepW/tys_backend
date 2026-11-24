// Credit note reports (docs/invoice-cancellation-paid.md R13, fase G) against
// in-memory credit notes and allocations.
const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const report = require("../src/services/report/reportCreditNote.service");
const { models } = require("../src/models");

const alpha = { id: 4, company_name_indo: "PT Alpha", customer_code: "C-TYS-2026-1100004" };
const beta = { id: 5, company_name_indo: "PT Beta", customer_code: "C-TYS-2026-1100005" };
const company = { id: 3, company_name: "PT TYS", initial_company: "TYS" };
const day = (value) => new Date(`${value}T10:00:00`);

const creditNotes = [
  { id: 1, credit_note_no: "001/CN/TYS/XI/2026", id_customer: 4, customer: alpha, id_company: 3, company,
    currency_type: "idr", source_type: "invoice", amount: "500000", date: day("2026-11-01"), is_active: true,
    invoice: { id: 6, invoice_no: "006/INV", total: "1000000", contract: { contract_no: "CT-1" } },
    paid_cancellation: { id: 1, settlement: "transfer", invoice_kept: "500000" } },
  { id: 2, credit_note_no: "002/CN/TYS/XI/2026", id_customer: 4, customer: alpha, id_company: 3, company,
    currency_type: "idr", source_type: "debit_note", amount: "50000", date: day("2026-11-01"), is_active: true,
    debit_note: { id: 20, debit_note_no: "DN-20", total: "50000" }, paid_cancellation: { id: 1, settlement: "transfer" } },
  { id: 3, credit_note_no: "003/CN/TYS/XI/2026", id_customer: 5, customer: beta, id_company: 3, company,
    currency_type: "idr", source_type: "invoice", amount: "200000", date: day("2026-11-10"), is_active: true,
    invoice: { id: 8, invoice_no: "008/INV", total: "400000" }, paid_cancellation: { id: 2, settlement: "transfer" } },
  { id: 4, credit_note_no: "004/CN/TYS/XI/2026", id_customer: 4, customer: alpha, id_company: 3, company,
    currency_type: "rmb", source_type: "invoice", amount: "1000", date: day("2026-11-05"), is_active: true,
    invoice: { id: 9, invoice_no: "009/INV", total: "2000" }, paid_cancellation: { id: 3, settlement: "transfer" } },
];
const allocations = [
  { id: 1, id_credit_note: 1, type: "transfer", target_type: "invoice", amount: "200000", date: day("2026-11-01"),
    note: "Paid from credit note 001/CN", invoice: { id: 2, invoice_no: "002/INV", pre_order: { pre_order_no: "PO-2" } }, is_active: true },
  { id: 2, id_credit_note: 1, type: "deposit", target_type: "invoice", amount: "100000", date: day("2026-11-15"),
    note: "Paid from the deposit of credit note 001/CN", invoice: { id: 7, invoice_no: "007/INV" }, is_active: true },
  { id: 3, id_credit_note: 2, type: "transfer", target_type: "debit_note", amount: "50000", date: day("2026-11-01"),
    note: "Paid from credit note 002/CN", debit_note: { id: 21, debit_note_no: "DN-21" }, is_active: true },
  { id: 4, id_credit_note: 3, type: "deposit", target_type: "invoice", amount: "50000", date: day("2026-11-20"),
    note: "Paid from the deposit of credit note 003/CN", invoice: { id: 10, invoice_no: "010/INV" }, is_active: true },
];

function mockDb(t) {
  const kept = [];
  const patch = (target, key, value) => {
    kept.push([target, key, target[key]]);
    target[key] = value;
  };
  t.after(() => { for (const [target, key, value] of kept.reverse()) target[key] = value; });
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (Array.isArray(value)) return value.includes(row[key]);
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if (Op.lte in value && !(new Date(row[key]) <= value[Op.lte])) return false;
      if (Op.gte in value && !(new Date(row[key]) >= value[Op.gte])) return false;
      return true;
    }
    return row[key] == value;
  });
  const sorted = (rows) => [...rows].sort((a, b) => a.date - b.date || a.id - b.id);
  patch(models.db1.CreditNote, "findAll", async ({ where }) => sorted(creditNotes.filter((row) => matches(row, where))));
  patch(models.db1.CreditNoteAllocation, "findAll", async ({ where }) => sorted(allocations.filter((row) => matches(row, where))));
  patch(models.db1.Customer, "findByPk", async (id) => [alpha, beta].find((row) => row.id == id) ?? null);
}

const fails = (status, pattern) => (error) => error.statusCode === status && (!pattern || pattern.test(error.message));

test("balances add up per customer, company, currency and source, today by default", async (t) => {
  mockDb(t);
  const result = await report.balances({});
  assert.deepEqual(
    result.data.map((row) => [row.customer.company_name_indo, row.currency_type, row.source_type, row.issued, row.used_transfer, row.used_deposit, row.balance]),
    [
      ["PT Alpha", "idr", "invoice", 500000, 200000, 100000, 200000],
      ["PT Alpha", "rmb", "invoice", 1000, 0, 0, 1000],
      ["PT Beta", "idr", "invoice", 200000, 0, 50000, 150000],
    ],
  );
  // The debit note credit note is used up, so it is left out by default.
  assert.deepEqual(result.totals, {
    idr: { issued: 700000, used: 350000, balance: 350000 },
    rmb: { issued: 1000, used: 0, balance: 1000 },
  });
  const all = await report.balances({ has_balance: "false" });
  assert.equal(all.data.length, 4);
  assert.deepEqual((await report.balances({ search: "beta" })).data.map((row) => row.customer.id), [5]);
  const page = await report.balances({ page: 2, limit: 2 });
  assert.deepEqual([page.data.length, page.pagination.total, page.pagination.total_page], [1, 3, 2]);
});

test("balances can be read as of an earlier day", async (t) => {
  mockDb(t);
  const result = await report.balances({ as_of: "2026-11-10", currency_type: "idr" });
  assert.deepEqual(result.data.map((row) => [row.customer.id, row.balance]), [[4, 300000], [5, 200000]]);
  await assert.rejects(report.balances({ as_of: "10/11/2026" }), fails(400, /as_of must be a date/));
});

test("the list shows each credit note's source, uses and status, newest first", async (t) => {
  mockDb(t);
  const rows = await report.list({});
  assert.deepEqual(rows.map((row) => [row.credit_note_no.slice(0, 3), row.status, row.balance]), [
    ["003", "open", 150000],
    ["004", "open", 1000],
    ["002", "used up", 0],
    ["001", "open", 200000],
  ]);
  const first = rows.at(-1);
  assert.deepEqual(first.source, { type: "invoice", id: 6, number: "006/INV", total: 1000000, contract_no: "CT-1", pre_order_no: null });
  assert.deepEqual([first.used_transfer, first.used_deposit, first.settlement], [200000, 100000, "transfer"]);
  assert.deepEqual((await report.list({ status: "used up" })).map((row) => row.id), [2]);
  assert.deepEqual((await report.list({ search: "006/inv" })).map((row) => row.id), [1]);
  assert.deepEqual((await report.list({ date_from: "2026-11-05", date_to: "2026-11-09" })).map((row) => row.id), [4]);
  await assert.rejects(report.list({ status: "closed" }), fails(400, /status must be one of/));
});

test("the detail tells where the money came from and what it paid", async (t) => {
  mockDb(t);
  const detail = await report.detail(1);
  assert.equal(detail.source.number, "006/INV");
  assert.equal(detail.source.cancellation.invoice_kept, "500000");
  assert.deepEqual(
    detail.allocations.map((row) => [row.type, row.target.number, row.target.pre_order_no, row.amount, row.balance]),
    [["transfer", "002/INV", "PO-2", 200000, 300000], ["deposit", "007/INV", null, 100000, 200000]],
  );
  assert.deepEqual([detail.balance, detail.status], [200000, "open"]);
  await assert.rejects(report.detail(99), fails(404));
});

test("the ledger of a customer starts from its opening balance", async (t) => {
  mockDb(t);
  const result = await report.ledger({ id_customer: 4, date_from: "2026-11-02", date_to: "2026-11-30" });
  assert.deepEqual(
    result.ledgers.map((ledger) => [ledger.currency_type, ledger.source_type, ledger.opening_balance, ledger.closing_balance]),
    [["idr", "invoice", 300000, 200000], ["idr", "debit_note", 0, 0], ["rmb", "invoice", 0, 1000]],
  );
  assert.deepEqual(
    result.ledgers[0].entries.map((entry) => [entry.kind, entry.document.number, entry.amount_in, entry.amount_out, entry.balance]),
    [["used as deposit", "007/INV", 0, 100000, 200000]],
  );
  assert.deepEqual(
    result.ledgers[2].entries.map((entry) => [entry.kind, entry.document.number, entry.amount_in, entry.balance]),
    [["issued", "009/INV", 1000, 1000]],
  );

  // From the start, a credit note comes before its uses on the same day.
  const full = await report.ledger({ id_customer: 4, currency_type: "idr", source_type: "invoice" });
  assert.deepEqual(full.ledgers[0].entries.map((entry) => [entry.kind, entry.balance]), [
    ["issued", 500000], ["transferred", 300000], ["used as deposit", 200000],
  ]);
  await assert.rejects(report.ledger({}), fails(400, /id_customer is required/));
  await assert.rejects(report.ledger({ id_customer: 4, date_from: "2026-12-01", date_to: "2026-11-01" }), fails(400, /date_from/));
  assert.deepEqual((await report.ledger({ id_customer: 5, date_to: "2026-11-05" })).ledgers, []);
});
