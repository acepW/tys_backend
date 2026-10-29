const test = require("node:test");
const assert = require("node:assert/strict");
const invoiceService = require("../src/services/invoice/invoice.service");
const fileService = require("../src/services/file.service");
const taxService = require("../src/services/masterTax/tax.service");
const approvalAccess = require("../src/services/approvalFlow/approvalAccess.service");
const APPROVAL_TARGETS = require("../src/services/approvalFlow/approvalTargets");
const { models, db1 } = require("../src/models");

const proof = [{ original_name: "proof.pdf", stored_name: "a.pdf", url: "/files/a.pdf", mime_type: "application/pdf", size: 1 }];

// Single-database run (isDoubleDatabase = false) against in-memory rows.
function mockDb(t, { invoice, payments = [] }) {
  const { Invoice, InvoicePayment, InvoiceVerificationProgress } = models.db1;
  const originals = [
    [db1, "transaction"], [Invoice, "findOne"], [Invoice, "update"],
    [InvoicePayment, "sum"], [InvoicePayment, "findOne"], [InvoicePayment, "create"],
    [InvoicePayment, "update"], [InvoiceVerificationProgress, "create"],
    [fileService, "syncFiles"], [invoiceService, "getById"], [taxService, "getActiveRates"],
  ].map(([target, key]) => [target, key, target[key]]);
  t.after(() => { for (const [target, key, value] of originals) target[key] = value; });

  const state = { invoice: { ...invoice }, payments: payments.map((row) => ({ ...row })), progress: [], files: [] };
  db1.transaction = async () => ({
    LOCK: { UPDATE: "UPDATE" },
    commit: async function () { this.finished = "commit"; },
    rollback: async function () { this.finished = "rollback"; },
  });
  Invoice.findOne = async ({ where }) => (where.id == state.invoice.id ? state.invoice : null);
  Invoice.update = async (data) => { Object.assign(state.invoice, data); return [1]; };
  InvoicePayment.sum = async (field, { where }) => state.payments
    .filter((row) => row.status === where.status).reduce((sum, row) => sum + Number(row[field]), 0);
  InvoicePayment.findOne = async ({ where }) => state.payments.filter((row) => row.status === where.status).at(-1) ?? null;
  InvoicePayment.create = async (data) => {
    const row = { id: state.payments.length + 1, ...data };
    state.payments.push(row);
    return row;
  };
  InvoicePayment.update = async (data, { where }) => {
    Object.assign(state.payments.find((row) => row.id === where.id), data);
    return [1];
  };
  InvoiceVerificationProgress.create = async (data) => {
    const row = { id: state.progress.length + 1, ...data };
    state.progress.push(row);
    return row;
  };
  fileService.syncFiles = async (type, id, files, opts) => state.files.push({ type, id, category: opts.category });
  invoiceService.getById = async () => state.invoice;
  taxService.getActiveRates = async () => ({ PPN: 11, PPH_23: 2, PP_20: 0.5, PPH_4_AYAT_2: 10 });
  return state;
}

const fails = (status, pattern) => (error) =>
  error.statusCode === status && (!pattern || pattern.test(error.message));

const upload = (data) => invoiceService.uploadPayment(1, {
  amount: 600, transfer_date: "2026-10-29", bank_name: "BCA", payment_proof: proof, ...data,
}, 7, false);

test("SPV approval uploads the invoice file and skips signing", async (t) => {
  const state = mockDb(t, { invoice: { id: 1, status: "on verification", total: "1000" } });
  await invoiceService.approveInvoice(1, null, "/files/invoice/inv-1.pdf", 9, false);
  assert.equal(state.invoice.status, "waiting for payment");
  assert.equal(state.invoice.file_invoice, "/files/invoice/inv-1.pdf");
  assert.equal(state.invoice.id_user_approve, 9);
  assert.equal(state.progress[0].status, "approved");
});

test("sales uploads a payment proof for verification", async (t) => {
  const state = mockDb(t, { invoice: { id: 1, status: "waiting for payment", total: "1000" } });
  await upload();
  assert.equal(state.invoice.status, "payment verification");
  assert.deepEqual(
    { amount: state.payments[0].amount, status: state.payments[0].status, bank_name: state.payments[0].bank_name,
      payment_method: state.payments[0].payment_method },
    { amount: 600, status: "verification", bank_name: "BCA", payment_method: "transfer" },
  );
  assert.deepEqual(state.files, [{ type: "invoice_payments", id: 1, category: "payment_proof" }]);
  assert.equal(state.progress[0].status, "payment uploaded");
});

test("payment proof upload validates its input before touching the invoice", async (t) => {
  mockDb(t, { invoice: { id: 1, status: "waiting for payment", total: "1000" } });
  for (const [data, message] of [
    [{ amount: 0 }, /amount must be a positive whole number/],
    [{ amount: 10.5 }, /amount must be a positive whole number/],
    [{ transfer_date: null }, /transfer_date is required/],
    [{ bank_name: " " }, /bank_name is required/],
    [{ payment_method: "cheque" }, /payment_method must be transfer or cash/],
    [{ payment_proof: [] }, /payment_proof must be a non-empty array/],
  ])
    await assert.rejects(upload(data), (error) => error.statusCode === 400 && message.test(error.message));
});

test("cash payments do not need a receiving bank", async (t) => {
  const state = mockDb(t, { invoice: { id: 1, status: "waiting for payment", total: "1000" } });
  await upload({ payment_method: "cash", bank_name: "" });
  assert.equal(state.payments[0].bank_name, null);
});

test("payment proof cannot exceed the remaining balance or skip verification", async (t) => {
  const state = mockDb(t, {
    invoice: { id: 1, status: "waiting for payment", total: "1000" },
    payments: [{ id: 1, amount: "600", status: "accepted" }],
  });
  await assert.rejects(upload({ amount: 500 }), /remaining invoice balance \(400\)/);
  state.invoice.status = "payment verification";
  await assert.rejects(upload({ amount: 400 }), (error) => error.statusCode === 409);
  state.invoice.status = "payment proof rejected";
  await upload({ amount: 400 });
  assert.equal(state.invoice.status, "payment verification");
});

test("accepted partial payments wait for the rest, then the invoice is paid", async (t) => {
  const state = mockDb(t, { invoice: { id: 1, status: "waiting for payment", total: "1000" } });
  await upload({ amount: 600 });
  await invoiceService.acceptPayment(1, null, 9, false);
  assert.equal(state.invoice.status, "waiting for payment");
  assert.equal(state.invoice.payment_amount, 600);
  assert.equal(state.payments[0].status, "accepted");
  assert.equal(state.payments[0].id_user_verify, 9);

  await upload({ amount: 400, transfer_date: "2026-11-02", payment_method: "cash" });
  await invoiceService.acceptPayment(1, "ok", 9, false);
  assert.equal(state.invoice.status, "paid");
  assert.equal(state.invoice.payment_amount, 1000);
  assert.equal(state.invoice.payment_date, "2026-11-02");
  assert.equal(state.invoice.payment_method, "cash");
  assert.deepEqual(state.progress.map((row) => row.status),
    ["payment uploaded", "payment accepted", "payment uploaded", "payment accepted"]);
});

test("AR & AP rejects a payment proof with a comment", async (t) => {
  const state = mockDb(t, { invoice: { id: 1, status: "waiting for payment", total: "1000" } });
  await upload();
  await assert.rejects(invoiceService.rejectPayment(1, " ", 9, false), /note is required/);
  await invoiceService.rejectPayment(1, "Kurang bayar 400", 9, false);
  assert.equal(state.invoice.status, "payment proof rejected");
  assert.equal(state.payments[0].status, "rejected");
  assert.equal(state.payments[0].verification_note, "Kurang bayar 400");
  assert.equal(state.progress.at(-1).status, "payment rejected");
  await assert.rejects(invoiceService.acceptPayment(1, null, 9, false), (error) => error.statusCode === 409);
});

const ppnInvoice = (data = {}) => ({
  id: 1, status: "waiting for payment", tax_ppn: true, tax_pph_23: false, tax_pp_20: false,
  tax_pph_4_ayat_2: false, tax_invoice_status: "none", sub_total: "1000000", ppn: "110000",
  pph: "0", pp_20: "0", pph_4_ayat_2: "0", total: "1110000", ...data,
});

test("sales requests the tax invoice once, only for an approved invoice with PPN", async (t) => {
  const state = mockDb(t, { invoice: ppnInvoice({ tax_ppn: false }) });
  await assert.rejects(invoiceService.requestTaxInvoice(1, null, 5, false), fails(400, /without PPN/));
  Object.assign(state.invoice, { tax_ppn: true, status: "pending" });
  await assert.rejects(invoiceService.requestTaxInvoice(1, null, 5, false), fails(409));
  state.invoice.status = "payment verification";
  await invoiceService.requestTaxInvoice(1, null, 5, false);
  assert.equal(state.invoice.tax_invoice_status, "requested");
  assert.equal(state.invoice.status, "payment verification");
  assert.equal(state.progress[0].status, "tax invoice requested");
  await assert.rejects(invoiceService.requestTaxInvoice(1, null, 5, false), fails(409, /already been requested/));
});

test("AR & AP uploads the tax invoice only after it is requested", async (t) => {
  const state = mockDb(t, { invoice: ppnInvoice() });
  const data = { tax_invoice_no: "010.000-26.00000001", tax_invoice_date: "2026-10-30", tax_invoice_attachment: proof };
  await assert.rejects(invoiceService.uploadTaxInvoice(1, data, 7, false), fails(409, /after it is requested/));
  state.invoice.tax_invoice_status = "requested";
  await invoiceService.uploadTaxInvoice(1, data, 7, false);
  assert.equal(state.invoice.tax_invoice_status, "issued");
  assert.equal(state.invoice.tax_invoice_no, "010.000-26.00000001");
  assert.equal(state.invoice.status, "waiting for payment");
  assert.deepEqual(state.files, [{ type: "invoices", id: 1, category: "tax_invoice_attachment" }]);
  assert.equal(state.progress[0].status, "tax invoice issued");
  await assert.rejects(invoiceService.uploadTaxInvoice(1, data, 7, false), fails(409, /already been issued/));
});

test("an accepted payment requests the tax invoice when sales has not", async (t) => {
  for (const [invoice, expected] of [
    [ppnInvoice(), "requested"],
    [ppnInvoice({ tax_invoice_status: "issued" }), "issued"],
    [ppnInvoice({ tax_ppn: false }), "none"],
  ]) {
    const state = mockDb(t, { invoice });
    await upload({ amount: 500000 });
    await invoiceService.acceptPayment(1, null, 9, false);
    assert.equal(state.invoice.status, "waiting for payment");
    assert.equal(state.invoice.tax_invoice_status, expected);
    assert.equal(state.progress.some((row) => row.status === "tax invoice requested"), expected === "requested");
  }
});

test("sales requests a revision with the client chat as proof", async (t) => {
  const state = mockDb(t, { invoice: ppnInvoice() });
  await assert.rejects(invoiceService.requestRevision(1, { revision_attachment: proof }, 5, false), fails(400, /note is required/));
  await assert.rejects(invoiceService.requestRevision(1, { note: "PPh 23" }, 5, false), fails(400, /revision_attachment/));
  await invoiceService.requestRevision(1, { note: "Klien potong PPh 23", revision_attachment: proof }, 5, false);
  assert.equal(state.invoice.status, "revision requested");
  assert.equal(state.progress[0].status, "revision requested");
  assert.deepEqual(state.files, [{ type: "invoice_verification_progress", id: state.progress[0].id, category: "revision_attachment" }]);
});

test("an invoice with an accepted payment cannot be revised", async (t) => {
  mockDb(t, { invoice: ppnInvoice(), payments: [{ id: 1, amount: "500000", status: "accepted" }] });
  await assert.rejects(invoiceService.requestRevision(1, { note: "PPh 23", revision_attachment: proof }, 5, false),
    fails(409, /after a payment has been accepted/));
});

test("AR & AP revises only the PPh and keeps the PPN of the tax invoice", async (t) => {
  const state = mockDb(t, { invoice: ppnInvoice({ status: "revision requested" }) });
  await assert.rejects(invoiceService.reviseInvoice(1, { tax_pph_23: "yes" }, 7, false), fails(400, /must be a boolean/));
  await invoiceService.reviseInvoice(1, { tax_pph_23: true, tax_ppn: false }, 7, false);
  assert.equal(state.invoice.status, "waiting for revision");
  assert.equal(state.invoice.tax_pph_23, true);
  assert.equal(state.invoice.tax_ppn, true);
  assert.equal(state.invoice.pph, 20000);
  assert.equal(state.invoice.ppn, "110000");
  assert.equal(state.invoice.total, 1090000);
  assert.equal(state.progress[0].status, "revised");
});

test("SPV rejects a revision back to AR & AP, then approves it with a new file", async (t) => {
  const state = mockDb(t, { invoice: ppnInvoice({ status: "waiting for revision" }) });
  await assert.rejects(invoiceService.rejectRevision(1, "", 8, false), fails(400, /note is required/));
  await invoiceService.rejectRevision(1, "PPh 4 ayat 2, bukan PPh 23", 8, false);
  assert.equal(state.invoice.status, "revision requested");
  await assert.rejects(invoiceService.approveRevision(1, null, undefined, 8, false), fails(409));
  state.invoice.status = "waiting for revision";
  await invoiceService.approveRevision(1, null, "/files/invoice/rev.pdf", 8, false);
  assert.equal(state.invoice.status, "waiting for payment");
  assert.equal(state.invoice.file_invoice, "/files/invoice/rev.pdf");
  assert.deepEqual(state.progress.map((row) => row.status), ["revision rejected", "revision approved"]);
});

test("AR & AP rejects an invalid revision request", async (t) => {
  const state = mockDb(t, { invoice: ppnInvoice({ status: "revision requested" }) });
  await assert.rejects(invoiceService.rejectRevisionRequest(1, " ", 7, false), fails(400));
  await invoiceService.rejectRevisionRequest(1, "Tidak ada bukti PPh dari klien", 7, false);
  assert.equal(state.invoice.status, "waiting for payment");
  assert.equal(state.progress[0].status, "revision request rejected");
});

test("tax invoice flows are keyed on tax_invoice_status", () => {
  const target = APPROVAL_TARGETS["invoice tax invoice"];
  const flows = [{ approval_for: "invoice tax invoice", status: "requested", scope: "all" }];
  const actor = { id: 7, id_position: 3 };
  assert.equal(approvalAccess.canAct(target, { status: "paid", tax_invoice_status: "requested" }, actor, flows), true);
  assert.equal(approvalAccess.canAct(target, { status: "requested", tax_invoice_status: "issued" }, actor, flows), false);
  const where = approvalAccess.taskWhere(target, flows, actor);
  assert.deepEqual(where[Object.getOwnPropertySymbols(where)[0]], [{ tax_invoice_status: "requested" }]);
});

test("sales may request a tax invoice while AR & AP verifies a payment", async (t) => {
  const originals = { user: models.db1.User.findByPk, flows: models.db1.ApprovalFlow.findAll,
    doc: models.db1.Invoice.findByPk, env: process.env.APPROVAL_ENFORCE };
  t.after(() => {
    models.db1.User.findByPk = originals.user;
    models.db1.ApprovalFlow.findAll = originals.flows;
    models.db1.Invoice.findByPk = originals.doc;
    if (originals.env === undefined) delete process.env.APPROVAL_ENFORCE;
    else process.env.APPROVAL_ENFORCE = originals.env;
  });
  process.env.APPROVAL_ENFORCE = "true";
  models.db1.User.findByPk = async () => ({ toJSON: () => ({ id: 5, id_position: 6 }) });
  models.db1.ApprovalFlow.findAll = async () => [{ approval_for: "invoice", status: "waiting for payment", scope: "all" }];
  models.db1.Invoice.findByPk = async () => ({ id: 1, status: "payment verification" });
  const statuses = invoiceService.taxInvoiceRequestStatuses;
  await approvalAccess.authorize("invoice", 1, 5, statuses, "waiting for payment");
  await assert.rejects(approvalAccess.authorize("invoice", 1, 5, statuses), fails(403));
});
