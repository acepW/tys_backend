const test = require("node:test");
const assert = require("node:assert/strict");
const invoiceService = require("../src/services/invoice/invoice.service");
const fileService = require("../src/services/file.service");
const taxService = require("../src/services/masterTax/tax.service");
const approvalAccess = require("../src/services/approvalFlow/approvalAccess.service");
const APPROVAL_TARGETS = require("../src/services/approvalFlow/approvalTargets");
const { models, db1 } = require("../src/models");

const proof = [{ original_name: "proof.pdf", stored_name: "a.pdf", url: "/files/a.pdf", mime_type: "application/pdf", size: 1 }];

test("proforma number is the invoice number with a PRO- prefix and is never stored", () => {
  const { Invoice } = models.db1;
  const invoice = Invoice.build({ invoice_no: "004/INV/TYSCG/XI/2026", proforma_invoice_no: "ignored" });
  assert.equal(invoice.toJSON().proforma_invoice_no, "PRO-004/INV/TYSCG/XI/2026");
  invoice.invoice_no = "005/INV/TYSCG/XI/2026";
  assert.equal(invoice.toJSON().proforma_invoice_no, "PRO-005/INV/TYSCG/XI/2026");
  assert.equal(Invoice.tableAttributes.proforma_invoice_no, undefined);
});

// Single-database run (isDoubleDatabase = false) against in-memory rows.
function mockDb(t, { invoice, payments = [], withholdingTaxes = [] }) {
  const { Invoice, InvoicePayment, InvoiceVerificationProgress, InvoiceWithholdingTax } = models.db1;
  const originals = [
    [db1, "transaction"], [Invoice, "findOne"], [Invoice, "update"],
    [InvoicePayment, "sum"], [InvoicePayment, "findOne"], [InvoicePayment, "create"],
    [InvoicePayment, "update"], [InvoiceVerificationProgress, "create"],
    [InvoiceWithholdingTax, "create"], [InvoiceWithholdingTax, "findAll"], [InvoiceWithholdingTax, "update"],
    [fileService, "syncFiles"], [invoiceService, "getById"], [taxService, "getActiveRates"],
  ].map(([target, key]) => [target, key, target[key]]);
  t.after(() => { for (const [target, key, value] of originals) target[key] = value; });

  const state = { invoice: { ...invoice }, payments: payments.map((row) => ({ ...row })), progress: [], files: [],
    withholdingTaxes: withholdingTaxes.map((row) => ({ ...row })) };
  InvoiceWithholdingTax.create = async (data) => {
    const row = { id: 50 + state.withholdingTaxes.length + 1, ...data };
    state.withholdingTaxes.push(row);
    return row;
  };
  // Copies, like rows read from the database, so the service sees the status
  // from before its own update.
  InvoiceWithholdingTax.findAll = async ({ where }) => state.withholdingTaxes
    .filter((row) => row.id_invoice === where.id_invoice).map((row) => ({ ...row }));
  InvoiceWithholdingTax.update = async (data, { where }) => {
    Object.assign(state.withholdingTaxes.find((row) => row.id === where.id), data);
    return [1];
  };
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

test("SPV approval needs no invoice file and skips signing", async (t) => {
  const state = mockDb(t, { invoice: { id: 1, status: "on verification", total: "1000" } });
  await invoiceService.approveInvoice(1, null, 9, false);
  assert.equal(state.invoice.status, "waiting for payment");
  assert.equal(state.invoice.file_invoice, undefined);
  assert.equal(state.invoice.id_user_approve, 9);
  assert.equal(state.progress[0].status, "approved");
  await assert.rejects(invoiceService.approveInvoice(1, null, 9, false),
    fails(409, /Approve is not allowed while the invoice is waiting for payment/));
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

test("accepted partial payments wait for the rest, then the invoice without PPh is paid & clear", async (t) => {
  const state = mockDb(t, { invoice: { id: 1, status: "waiting for payment", total: "1000" } });
  await upload({ amount: 600 });
  await invoiceService.acceptPayment(1, null, 9, false);
  assert.equal(state.invoice.status, "waiting for payment");
  assert.equal(state.invoice.payment_amount, 600);
  assert.equal(state.payments[0].status, "accepted");
  assert.equal(state.payments[0].id_user_verify, 9);

  await upload({ amount: 400, transfer_date: "2026-11-02", payment_method: "cash" });
  await invoiceService.acceptPayment(1, "ok", 9, false);
  assert.equal(state.invoice.status, "paid & clear");
  assert.equal(state.invoice.payment_amount, 1000);
  assert.equal(state.invoice.payment_date, "2026-11-02");
  assert.equal(state.invoice.payment_method, "cash");
  assert.deepEqual(state.withholdingTaxes, []);
  assert.deepEqual(state.progress.map((row) => row.status),
    ["payment uploaded", "payment accepted", "payment uploaded", "payment accepted", "paid & clear"]);
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

test("AR & AP uploads the final invoice with the tax invoice only after they are requested", async (t) => {
  const state = mockDb(t, { invoice: ppnInvoice() });
  const data = { file_final_invoice: proof, tax_invoice_no: "010.000-26.00000001",
    tax_invoice_date: "2026-10-30", tax_invoice_attachment: proof };
  await assert.rejects(invoiceService.uploadTaxInvoice(1, data, 7, false), fails(409, /after they are requested/));
  state.invoice.tax_invoice_status = "requested";
  for (const files of [undefined, [], "/files/invoice/final-1.pdf"])
    await assert.rejects(invoiceService.uploadTaxInvoice(1, { ...data, file_final_invoice: files }, 7, false),
      fails(400, /file_final_invoice must be a non-empty array/));
  await assert.rejects(invoiceService.uploadTaxInvoice(1, { ...data, tax_invoice_no: "" }, 7, false),
    fails(400, /tax_invoice_no is required/));
  assert.equal(state.invoice.tax_invoice_status, "requested");
  await invoiceService.uploadTaxInvoice(1, data, 7, false);
  assert.equal(state.invoice.tax_invoice_status, "issued");
  assert.equal(state.invoice.tax_invoice_no, "010.000-26.00000001");
  assert.equal(state.invoice.is_final, true);
  assert.ok(state.invoice.final_at instanceof Date);
  assert.equal(state.invoice.status, "waiting for payment");
  assert.deepEqual(state.files, [
    { type: "invoices", id: 1, category: "file_final_invoice" },
    { type: "invoices", id: 1, category: "tax_invoice_attachment" },
  ]);
  assert.equal(state.progress[0].status, "tax invoice issued");
  await assert.rejects(invoiceService.uploadTaxInvoice(1, data, 7, false), fails(409, /already been issued/));
});

test("an invoice without PPN only needs the final invoice", async (t) => {
  const state = mockDb(t, { invoice: ppnInvoice({ tax_ppn: false, tax_invoice_status: "requested" }) });
  await invoiceService.uploadTaxInvoice(1, { file_final_invoice: proof,
    tax_invoice_no: "ignored", tax_invoice_attachment: proof }, 7, false);
  assert.deepEqual([state.invoice.tax_invoice_status, state.invoice.is_final, state.invoice.tax_invoice_no],
    ["issued", true, undefined]);
  assert.deepEqual(state.files, [{ type: "invoices", id: 1, category: "file_final_invoice" }]);
  assert.equal(state.progress[0].status, "final invoice issued");
});

test("an accepted payment requests the final invoice (and tax invoice with PPN) when sales has not", async (t) => {
  for (const [invoice, expected, progress] of [
    [ppnInvoice(), "requested", "tax invoice requested"],
    [ppnInvoice({ tax_invoice_status: "issued" }), "issued", null],
    [ppnInvoice({ tax_ppn: false }), "requested", "final invoice requested"],
  ]) {
    const state = mockDb(t, { invoice });
    await upload({ amount: 500000 });
    await invoiceService.acceptPayment(1, null, 9, false);
    assert.equal(state.invoice.status, "waiting for payment");
    assert.equal(state.invoice.tax_invoice_status, expected);
    assert.deepEqual(state.progress.map((row) => row.status).filter((status) => status.endsWith("requested")),
      progress ? [progress] : []);
  }
});

test("SPV rejects for the tax back to AR & AP, who edits and resubmits", async (t) => {
  const state = mockDb(t, { invoice: { id: 1, status: "on verification", total: "1000" } });
  await assert.rejects(invoiceService.rejectInvoice(1, "x", 9, false, "other"), fails(400, /reject_type must be one of/));
  await invoiceService.rejectInvoice(1, "PPh 23 salah", 9, false);
  assert.deepEqual([state.invoice.status, state.invoice.reject_type, state.invoice.id_user_reject], ["rejected", "tax", 9]);
  assert.deepEqual([state.progress[0].status, state.progress[0].note], ["rejected", "PPh 23 salah"]);
  await assert.rejects(invoiceService.rejectInvoice(1, null, 9, false), fails(409, /while the invoice is rejected/));

  await invoiceService.submitInvoice(1, null, 7, false);
  assert.equal(state.invoice.status, "on verification");
  assert.deepEqual([state.progress[1].status, state.progress[1].note],
    ["submitted", "Invoice resubmitted after tax revision"]);
});

test("SPV rejects a changed CT/PO: the invoice is cancelled for good", async (t) => {
  const state = mockDb(t, { invoice: { id: 1, status: "on verification", total: "1000" } });
  await invoiceService.rejectInvoice(1, "CT addendum", 9, false, "ct/po cancelled");
  assert.deepEqual([state.invoice.status, state.invoice.reject_type], ["cancelled", "ct/po cancelled"]);
  assert.equal(state.progress[0].status, "cancelled");
  await assert.rejects(invoiceService.submitInvoice(1, null, 7, false), fails(409, /while the invoice is cancelled/));
});

test("only a pending or tax-rejected invoice can be edited", async (t) => {
  const controller = require("../src/controllers/invoice/invoice.controller");
  const originals = { find: invoiceService.findById, update: invoiceService.updateWithRelations };
  t.after(() => Object.assign(invoiceService, { findById: originals.find, updateWithRelations: originals.update }));
  let status;
  let saved;
  invoiceService.findById = async () => ({ id: 1, status });
  invoiceService.updateWithRelations = async (id, data) => { saved = data; return data; };
  const call = async () => {
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await controller.update({ params: { id: 1 }, body: { note: "PPh diperbaiki", status: "paid", is_final: true,
      reject_type: null } }, res);
    return res.code;
  };
  for (const [current, code] of [["pending", 200], ["rejected", 200], ["cancelled", 409], ["on verification", 409]]) {
    status = current;
    assert.equal(await call(), code);
  }
  assert.deepEqual(saved, { note: "PPh diperbaiki" });
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

test("SPV rejects a revision back to AR & AP, then approves it without a file", async (t) => {
  const state = mockDb(t, { invoice: ppnInvoice({ status: "waiting for revision" }) });
  await assert.rejects(invoiceService.rejectRevision(1, "", 8, false), fails(400, /note is required/));
  await invoiceService.rejectRevision(1, "PPh 4 ayat 2, bukan PPh 23", 8, false);
  assert.equal(state.invoice.status, "revision requested");
  await assert.rejects(invoiceService.approveRevision(1, null, 8, false), fails(409));
  state.invoice.status = "waiting for revision";
  await invoiceService.approveRevision(1, null, 8, false);
  assert.equal(state.invoice.status, "waiting for payment");
  assert.equal(state.invoice.file_invoice, undefined);
  assert.deepEqual(state.progress.map((row) => row.status), ["revision rejected", "revision approved"]);
});

test("a revision approved after the final invoice was issued asks AR & AP to upload it again", async (t) => {
  const state = mockDb(t, { invoice: ppnInvoice({ status: "waiting for revision", is_final: true,
    tax_invoice_status: "issued", tax_invoice_no: "010.000-26.00000001", tax_invoice_date: "2026-10-30" }) });
  await invoiceService.approveRevision(1, null, 8, false);
  assert.deepEqual([state.invoice.status, state.invoice.tax_invoice_status, state.invoice.is_final],
    ["waiting for payment", "requested", true]);
  assert.deepEqual(state.progress.map((row) => row.status), ["revision approved", "final invoice requested"]);

  await invoiceService.uploadTaxInvoice(1, { file_final_invoice: proof }, 7, false);
  assert.deepEqual([state.invoice.tax_invoice_status, state.invoice.tax_invoice_no, state.invoice.tax_invoice_date],
    ["issued", "010.000-26.00000001", "2026-10-30"]);
  assert.deepEqual(state.files, [{ type: "invoices", id: 1, category: "file_final_invoice" }]);
  assert.equal(state.progress.at(-1).note, "Final invoice and tax invoice 010.000-26.00000001 issued");
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

// Paid-off invoice with PPh 23 (and optionally PPh 4(2)) waiting for its receipts.
const whtInvoice = (data = {}) => ppnInvoice({
  tax_pph_23: true, pph: "20000", sub_total: "1000000", total: "1090000", ...data,
});
const checklist = Object.fromEntries(require("../src/models/invoice/invoiceWithholdingTax.model")
  .WHT_CHECKLIST.map((item) => [item, true]));
const receipt = { withholding_tax_receipt: proof, note: "Bukti potong dari klien" };
const acceptBody = { checklist, receipt_no: "BP-0001", tax_period: "11-2026", receipt_date: "2026-11-03" };
const rejectBody = { note: "NPWP pemotong salah", wht_reject_attachment: proof };

test("paying off an invoice with PPh creates one receipt per PPh type and waits for them", async (t) => {
  const state = mockDb(t, { invoice: whtInvoice({ tax_pph_4_ayat_2: true, pph_4_ayat_2: "100000", total: "990000" }) });
  await upload({ amount: 990000 });
  await invoiceService.acceptPayment(1, null, 9, false);
  assert.equal(state.invoice.status, "paid waiting wht");
  assert.deepEqual(state.withholdingTaxes.map((row) => [row.tax_type, row.dpp, row.rate, row.amount, row.status]),
    [["pph_23", "1000000", 2, "20000", "waiting"], ["pph_4_ayat_2", "1000000", 10, "100000", "waiting"]]);
  assert.match(state.progress.find((row) => row.status === "payment accepted").note, /PPh 23, PPh 4\(2\)/);
  assert.equal(state.progress.some((row) => row.status === "paid & clear"), false);
});

test("a PP 20 or a zero PPh needs no withholding tax receipt", async (t) => {
  const state = mockDb(t, { invoice: whtInvoice({ pph: "0", tax_pp_20: true, pp_20: "5000" }) });
  await upload({ amount: 1090000 });
  await invoiceService.acceptPayment(1, null, 9, false);
  assert.equal(state.invoice.status, "paid & clear");
  assert.deepEqual(state.withholdingTaxes, []);
});

test("sales uploads a receipt, AR & AP rejects it with screenshots, then accepts the re-upload", async (t) => {
  const state = mockDb(t, {
    invoice: whtInvoice({ status: "paid waiting wht" }),
    withholdingTaxes: [{ id: 51, id_invoice: 1, tax_type: "pph_23", status: "waiting" }],
  });
  await assert.rejects(invoiceService.uploadWithholdingTax(1, 51, { note: "x" }, 7, false),
    fails(400, /withholding_tax_receipt must be a non-empty array/));
  await assert.rejects(invoiceService.uploadWithholdingTax(1, 99, receipt, 7, false), fails(404));
  await assert.rejects(invoiceService.acceptWithholdingTax(1, 51, acceptBody, 9, false),
    fails(409, /while the invoice is paid waiting wht/));

  await invoiceService.uploadWithholdingTax(1, 51, receipt, 7, false);
  assert.deepEqual([state.invoice.status, state.withholdingTaxes[0].status, state.withholdingTaxes[0].id_user_upload],
    ["wht verification", "verification", 7]);
  assert.deepEqual(state.files.at(-1), { type: "invoice_withholding_taxes", id: 51, category: "withholding_tax_receipt" });
  await assert.rejects(invoiceService.uploadWithholdingTax(1, 51, receipt, 7, false),
    fails(409, /cannot be uploaded while it is verification/));

  await assert.rejects(invoiceService.rejectWithholdingTax(1, 51, { note: "" }, 9, false), fails(400, /note is required/));
  await assert.rejects(invoiceService.rejectWithholdingTax(1, 51, { note: "x" }, 9, false),
    fails(400, /wht_reject_attachment must be a non-empty array/));
  await invoiceService.rejectWithholdingTax(1, 51, { ...rejectBody, checklist: { ...checklist, withholder_npwp: false } }, 9, false);
  assert.deepEqual([state.invoice.status, state.withholdingTaxes[0].status, state.withholdingTaxes[0].note_reject],
    ["wht rejected", "rejected", "NPWP pemotong salah"]);
  assert.equal(state.withholdingTaxes[0].checklist.withholder_npwp, false);
  const rejected = state.progress.at(-1);
  assert.deepEqual([rejected.status, rejected.note], ["wht rejected", "PPh 23: NPWP pemotong salah"]);
  assert.deepEqual(state.files.at(-1), { type: "invoice_verification_progress", id: rejected.id, category: "wht_reject_attachment" });

  await invoiceService.uploadWithholdingTax(1, 51, receipt, 7, false);
  await invoiceService.acceptWithholdingTax(1, 51, acceptBody, 9, false);
  assert.equal(state.invoice.status, "paid & clear");
  assert.deepEqual(
    [state.withholdingTaxes[0].status, state.withholdingTaxes[0].receipt_no, state.withholdingTaxes[0].tax_period,
      state.withholdingTaxes[0].receipt_date, state.withholdingTaxes[0].id_user_verify],
    ["clear", "BP-0001", "11-2026", "2026-11-03", 9]);
  assert.deepEqual(state.progress.map((row) => row.status),
    ["wht uploaded", "wht rejected", "wht uploaded", "wht accepted", "paid & clear"]);
});

test("accepting a receipt needs every checklist item and a valid receipt number, period and date", async (t) => {
  const state = mockDb(t, {
    invoice: whtInvoice({ status: "wht verification" }),
    withholdingTaxes: [{ id: 51, id_invoice: 1, tax_type: "pph_23", status: "verification" }],
  });
  for (const [body, message] of [
    [{ ...acceptBody, checklist: undefined }, /checklist must be an object/],
    [{ ...acceptBody, checklist: { ...checklist, dpp: false, rate: "yes" } }, /unchecked: dpp, rate/],
    [{ ...acceptBody, receipt_no: " " }, /receipt_no is required/],
    [{ ...acceptBody, tax_period: "2026-11" }, /tax_period must use MM-YYYY format/],
    [{ ...acceptBody, tax_period: "13-2026" }, /tax_period must use MM-YYYY format/],
    [{ ...acceptBody, receipt_date: "bukan tanggal" }, /receipt_date must be a valid date/],
  ])
    await assert.rejects(invoiceService.acceptWithholdingTax(1, 51, body, 9, false), fails(400, message));
  assert.equal(state.withholdingTaxes[0].status, "verification");
});

test("with two receipts the invoice status follows all of them", async (t) => {
  const state = mockDb(t, {
    invoice: whtInvoice({ status: "paid waiting wht" }),
    withholdingTaxes: [
      { id: 51, id_invoice: 1, tax_type: "pph_23", status: "waiting" },
      { id: 52, id_invoice: 1, tax_type: "pph_4_ayat_2", status: "waiting" },
    ],
  });
  await invoiceService.uploadWithholdingTax(1, 51, receipt, 7, false);
  assert.equal(state.invoice.status, "wht verification");
  // The other receipt can still be uploaded while the first is checked.
  await invoiceService.uploadWithholdingTax(1, 52, receipt, 7, false);
  await invoiceService.rejectWithholdingTax(1, 51, rejectBody, 9, false);
  assert.equal(state.invoice.status, "wht verification");
  await invoiceService.acceptWithholdingTax(1, 52, acceptBody, 9, false);
  assert.equal(state.invoice.status, "wht rejected");
  await invoiceService.uploadWithholdingTax(1, 51, receipt, 7, false);
  assert.equal(state.invoice.status, "wht verification");
  await invoiceService.acceptWithholdingTax(1, 51, { ...acceptBody, receipt_no: "BP-0002" }, 9, false);
  assert.equal(state.invoice.status, "paid & clear");
  assert.equal(state.progress.filter((row) => row.status === "paid & clear").length, 1);
});

test("withholding tax receipt flows are on the invoice target", () => {
  const { statuses } = APPROVAL_TARGETS.invoice;
  assert.equal(statuses["paid waiting wht"], "Upload Withholding Tax Receipt");
  assert.equal(statuses["wht verification"], "Verify Withholding Tax Receipt");
  assert.equal(statuses["wht rejected"], "Re-upload Withholding Tax Receipt");
  assert.deepEqual(invoiceService.taxInvoiceRequestStatuses.slice(-4),
    ["paid waiting wht", "wht verification", "wht rejected", "paid & clear"]);
});
