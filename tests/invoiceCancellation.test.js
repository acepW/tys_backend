const test = require("node:test");
const assert = require("node:assert/strict");
const invoiceService = require("../src/services/invoice/invoice.service");
const debitNoteService = require("../src/services/debitNote/debitNote.service");
const fileService = require("../src/services/file.service");
const taxService = require("../src/services/masterTax/tax.service");
const APPROVAL_TARGETS = require("../src/services/approvalFlow/approvalTargets");
const { models, db1 } = require("../src/models");

const proof = [{ original_name: "chat.png", stored_name: "a.png", url: "/files/a.png", mime_type: "image/png", size: 1 }];

// Single-database run (isDoubleDatabase = false) against in-memory tables. Reads
// return copies, like rows read from the database.
// A test may call it again for a fresh state; the real methods are kept once and
// put back after the test.
const restores = new WeakMap();
function mockDb(t, tables) {
  if (!restores.has(t)) {
    const kept = new Map();
    restores.set(t, kept);
    t.after(() => { for (const [[target, key], value] of kept) target[key] = value; });
  }
  const kept = restores.get(t);
  const patch = (target, key, value) => {
    if (![...kept.keys()].some(([keptTarget, keptKey]) => keptTarget === target && keptKey === key))
      kept.set([target, key], target[key]);
    target[key] = value;
  };

  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (Array.isArray(value)) return value.includes(row[key]);
    if (value && typeof value === "object" && !(value instanceof Date)) return true; // Op conditions
    return row[key] == value;
  });
  const state = { files: [] };
  for (const name of ["Invoice", "InvoicePayment", "InvoiceCancellation", "InvoiceVerificationProgress",
    "InvoiceService", "DebitNote", "DebitNoteVerificationProgress", "Company"]) {
    const Model = models.db1[name];
    const table = (state[name] = (tables[name] || []).map((row) => ({ ...row })));
    patch(Model, "findOne", async ({ where } = {}) => {
      const row = table.filter((item) => matches(item, where)).at(-1);
      return row ? { ...row } : null;
    });
    patch(Model, "findByPk", async (id) => {
      const row = table.find((item) => item.id == id);
      return row ? { ...row } : null;
    });
    patch(Model, "findAll", async ({ where } = {}) => table.filter((item) => matches(item, where)).map((row) => ({ ...row })));
    patch(Model, "count", async ({ where } = {}) => table.filter((item) => matches(item, where)).length);
    patch(Model, "max", async () => Math.max(0, ...table.map((row) => row.id)));
    patch(Model, "create", async (data) => {
      const row = { id: Math.max(0, ...table.map((item) => item.id)) + 1, ...data };
      table.push(row);
      return { ...row };
    });
    patch(Model, "update", async (data, { where }) => {
      const rows = table.filter((item) => matches(item, where));
      for (const row of rows) Object.assign(row, data);
      return [rows.length];
    });
  }
  patch(db1, "transaction", async () => ({
    LOCK: { UPDATE: "UPDATE" },
    commit: async function () { this.finished = "commit"; },
    rollback: async function () { this.finished = "rollback"; },
  }));
  patch(fileService, "syncFiles", async (type, id, files, opts) => state.files.push({ type, id, category: opts.category }));
  patch(invoiceService, "getById", async (id) => state.Invoice.find((row) => row.id == id));
  patch(taxService, "getActiveRates", async () => ({ PPN: 11, PPH_23: 2, PP_20: 0.5, PPH_4_AYAT_2: 10 }));
  return state;
}

const fails = (status, pattern) => (error) =>
  error.statusCode === status && (!pattern || pattern.test(error.message));

const invoice = (data = {}) => ({
  id: 1, invoice_no: "006/INV/TYS/XI/2026", status: "waiting for payment", tax_invoice_status: "none",
  id_company: 3, id_customer: 4, id_quotation: 5, id_contract: 6, id_contract_payment: 7, source_type: "contract",
  currency_type: "idr", tax_ppn: true, tax_pph_23: true, tax_pp_20: false, tax_pph_4_ayat_2: false,
  sub_total: "1000001", ppn: "110000", pph: "20000", pp_20: "0", pph_4_ayat_2: "0", total: "1090001",
  date: "2026-11-01T00:00:00.000Z", due_date: "2026-12-01T00:00:00.000Z", is_final: false,
  id_invoice_converted_from: null, id_debit_note: null, is_active: true, createdAt: new Date(), ...data,
});
const tables = (data = {}, extra = {}) => ({
  Invoice: [invoice(data)],
  Company: [{ id: 3, initial_company: "tys" }],
  InvoiceService: [
    { id: 1, id_invoice: 1, id_quotation_service: 11, qty: 2, total_price_idr: "600001", total_price_rmb: "301", is_active: true },
    { id: 2, id_invoice: 1, id_quotation_service: 12, qty: 1, total_price_idr: "400000", total_price_rmb: "200", is_active: true },
  ],
  ...extra,
});
const request = (data = {}) => invoiceService.requestCancellation(1, {
  type: "convert", reason: "Klien minta konversi", cancellation_attachment: proof, ...data,
}, 5, false);
const approveAll = async () => {
  await invoiceService.approveCancellation(1, null, 7, false);
  await invoiceService.approveCancellation(1, null, 8, false);
  await invoiceService.approveCancellation(1, "OK", 9, false);
};

test("cancellation steps are on the invoice approval target", () => {
  const { statuses } = APPROVAL_TARGETS.invoice;
  assert.equal(statuses["cancellation requested"], "Approve / Reject Invoice Cancellation by AR & AP");
  assert.equal(statuses["cancellation reviewed"], "Approve / Reject Invoice Cancellation by SPV FAT Internal");
  assert.equal(statuses["cancellation verified"], "Approve / Reject Invoice Cancellation by Director");
  assert.deepEqual(invoiceService.cancellationStatuses,
    ["cancellation requested", "cancellation reviewed", "cancellation verified"]);
});

test("a cancellation request validates its input", async (t) => {
  mockDb(t, tables());
  for (const [data, message] of [
    [{ type: "refund" }, /type must be one of: cancel, convert/],
    [{ reason: " " }, /reason is required/],
    [{ cancellation_attachment: [] }, /cancellation_attachment must be a non-empty array/],
  ])
    await assert.rejects(request(data), fails(400, message));
});

test("only an unpaid proforma without a tax invoice request, and not a conversion, can be cancelled", async (t) => {
  for (const [data, extra, status, message] of [
    [{ status: "payment verification" }, {}, 409, /not allowed while the invoice is payment verification/],
    [{ tax_invoice_status: "requested" }, {}, 409, /after its tax invoice was requested/],
    [{ id_invoice_converted_from: 9 }, {}, 409, /converted to 50% cannot be cancelled or converted again/],
    [{}, { InvoicePayment: [{ id: 1, id_invoice: 1, status: "rejected" }] }, 409, /after a payment proof was uploaded/],
  ]) {
    const state = mockDb(t, tables(data, extra));
    await assert.rejects(request(), fails(status, message));
    assert.deepEqual(state.InvoiceCancellation, []);
  }
});

test("sales requests a conversion; AR & AP, SPV and the director approve it in turn", async (t) => {
  const state = mockDb(t, tables());
  await request();
  assert.equal(state.Invoice[0].status, "cancellation requested");
  assert.deepEqual(
    [state.InvoiceCancellation[0].type, state.InvoiceCancellation[0].status, state.InvoiceCancellation[0].cancel_debit_note,
      state.InvoiceCancellation[0].id_user_request],
    ["convert", "requested", false, 5]);
  assert.deepEqual(state.files, [{ type: "invoice_cancellations", id: 1, category: "cancellation_attachment" }]);
  assert.equal(state.InvoiceVerificationProgress[0].note, "Conversion to 50% requested: Klien minta konversi");

  await invoiceService.approveCancellation(1, null, 7, false);
  assert.deepEqual([state.Invoice[0].status, state.InvoiceCancellation[0].status, state.InvoiceCancellation[0].id_user_review],
    ["cancellation reviewed", "reviewed", 7]);
  await invoiceService.approveCancellation(1, null, 8, false);
  assert.deepEqual([state.Invoice[0].status, state.InvoiceCancellation[0].status, state.InvoiceCancellation[0].id_user_verify],
    ["cancellation verified", "verified", 8]);
  // Nothing is created before the director approves.
  assert.equal(state.Invoice.length, 1);
  await invoiceService.approveCancellation(1, "OK", 9, false);

  const [old, created] = state.Invoice;
  assert.equal(old.status, "cancelled");
  assert.deepEqual([state.InvoiceCancellation[0].status, state.InvoiceCancellation[0].id_user_approve,
    state.InvoiceCancellation[0].id_invoice_new], ["approved", 9, created.id]);
  // 1000001 x 50% rounds to 500001; PPN 11% and PPh 23 2% are recalculated.
  assert.deepEqual(
    [created.invoice_no, created.status, created.is_final, created.tax_invoice_status, created.sub_total,
      created.ppn, created.pph, created.total, created.id_invoice_converted_from, created.id_contract_payment,
      created.tax_ppn, created.tax_pph_23],
    ["002/INV/TYS/XI/2026", "waiting for payment", false, "none", 500001, 55000, 10000, 545001, 1, 7, true, true]);
  // Same 30 days until due as the cancelled invoice.
  assert.equal(new Date(created.due_date) - new Date(created.date), 30 * 24 * 60 * 60 * 1000);
  // Service lines at 50%, the rounding difference on the last line.
  const lines = state.InvoiceService.filter((row) => row.id_invoice === created.id);
  assert.deepEqual(lines.map((row) => [row.id_quotation_service, row.total_price_idr, row.price_idr, row.total_price_rmb]),
    [[11, 300001, 150001, 151], [12, 200000, 200000, 100]]);
  assert.deepEqual(state.InvoiceVerificationProgress.map((row) => [row.id_invoice, row.status]), [
    [1, "cancellation requested"], [1, "cancellation reviewed"], [1, "cancellation verified"],
    [created.id, "created"], [1, "converted"]]);
  assert.equal(state.InvoiceVerificationProgress.at(-1).note, `OK; Converted to 50%, replaced by invoice ${created.invoice_no}`);
});

test("a full cancel approved by the director cancels the invoice without creating one", async (t) => {
  const state = mockDb(t, tables());
  await request({ type: "cancel" });
  await approveAll();
  assert.equal(state.Invoice.length, 1);
  assert.equal(state.Invoice[0].status, "cancelled");
  assert.equal(state.InvoiceCancellation[0].id_invoice_new, null);
  assert.deepEqual(state.InvoiceVerificationProgress.at(-1), {
    ...state.InvoiceVerificationProgress.at(-1), status: "cancelled", note: "OK; Cancellation approved by Director" });
});

test("a rejection at any step needs a note and sends the invoice back to waiting for payment", async (t) => {
  const state = mockDb(t, tables());
  await assert.rejects(invoiceService.approveCancellation(1, null, 7, false), fails(409, /while the invoice is waiting for payment/));
  await request();
  await invoiceService.approveCancellation(1, null, 7, false);
  await assert.rejects(invoiceService.rejectCancellation(1, " ", 8, false), fails(400, /note is required/));
  await invoiceService.rejectCancellation(1, "Bukti kurang", 8, false);
  assert.equal(state.Invoice[0].status, "waiting for payment");
  assert.deepEqual([state.InvoiceCancellation[0].status, state.InvoiceCancellation[0].reject_note,
    state.InvoiceCancellation[0].id_user_reject], ["rejected", "Bukti kurang", 8]);
  assert.equal(state.InvoiceVerificationProgress.at(-1).note, "Rejected by SPV FAT Internal: Bukti kurang");

  // A new request is a new row; the rejected one stays as history.
  await request({ type: "cancel" });
  assert.deepEqual(state.InvoiceCancellation.map((row) => [row.type, row.status]),
    [["convert", "rejected"], ["cancel", "requested"]]);
  await invoiceService.approveCancellation(1, null, 7, false);
  assert.equal(state.InvoiceCancellation[1].status, "reviewed");
});

test("sales must choose whether the debit note is cancelled too, and a paid one cannot be", async (t) => {
  const debitNote = (status) => ({ DebitNote: [{ id: 21, status, is_active: true }] });
  let state = mockDb(t, tables({ id_debit_note: 21 }, debitNote("approved")));
  await assert.rejects(request(), fails(400, /cancel_debit_note must be a boolean/));
  state = mockDb(t, tables({ id_debit_note: 21 }, debitNote("paid")));
  await assert.rejects(request({ cancel_debit_note: true }), fails(409, /paid debit note cannot be cancelled/));
  await request({ cancel_debit_note: false });
  assert.equal(state.InvoiceCancellation[0].cancel_debit_note, false);
  // Without an active debit note the choice is ignored.
  state = mockDb(t, tables({ id_debit_note: 21 }, debitNote("cancelled")));
  await request({ cancel_debit_note: true });
  assert.equal(state.InvoiceCancellation[0].cancel_debit_note, false);
});

test("the debit note is cancelled with the invoice when sales chose so", async (t) => {
  const state = mockDb(t, tables({ id_debit_note: 21 }, { DebitNote: [{ id: 21, status: "approved", is_active: true }] }));
  await request({ type: "cancel", cancel_debit_note: true });
  await invoiceService.approveCancellation(1, null, 7, false);
  await invoiceService.approveCancellation(1, null, 8, false);
  assert.equal(state.DebitNote[0].status, "approved");
  await invoiceService.approveCancellation(1, null, 9, false);
  assert.equal(state.DebitNote[0].status, "cancelled");
  assert.deepEqual([state.DebitNoteVerificationProgress[0].status, state.DebitNoteVerificationProgress[0].note],
    ["cancelled", "Cancelled with invoice 006/INV/TYS/XI/2026"]);
  assert.equal(state.InvoiceVerificationProgress.at(-1).note, "Cancellation approved by Director; debit note cancelled");
});

test("a conversion keeping the debit note moves it to the new invoice; cancelling it leaves the new one without", async (t) => {
  let state = mockDb(t, tables({ id_debit_note: 21 }, { DebitNote: [{ id: 21, status: "approved", is_active: true }] }));
  await request({ cancel_debit_note: false });
  await approveAll();
  assert.equal(state.Invoice[1].id_debit_note, 21);
  assert.equal(state.DebitNote[0].status, "approved");

  state = mockDb(t, tables({ id_debit_note: 21 }, { DebitNote: [{ id: 21, status: "approved", is_active: true }] }));
  await request({ cancel_debit_note: true });
  await approveAll();
  assert.equal(state.Invoice[1].id_debit_note, null);
  assert.equal(state.DebitNote[0].status, "cancelled");
});

test("a debit note paid during the request blocks the director's approval", async (t) => {
  const state = mockDb(t, tables({ id_debit_note: 21 }, { DebitNote: [{ id: 21, status: "approved", is_active: true }] }));
  await request({ type: "cancel", cancel_debit_note: true });
  state.DebitNote[0].status = "paid";
  await invoiceService.approveCancellation(1, null, 7, false);
  await invoiceService.approveCancellation(1, null, 8, false);
  await assert.rejects(invoiceService.approveCancellation(1, null, 9, false), fails(409, /debit note has been paid/));
});

test("a cancelled debit note is final, and cannot be paid while its invoice cancellation is in process", async (t) => {
  const { DebitNote, InvoiceCancellation } = models.db1;
  const originals = { find: DebitNote.findByPk, count: InvoiceCancellation.count };
  t.after(() => { DebitNote.findByPk = originals.find; InvoiceCancellation.count = originals.count; });
  let status = "cancelled";
  let pending = 0;
  let countWhere;
  DebitNote.findByPk = async (id) => ({ id, status });
  InvoiceCancellation.count = async (options) => { countWhere = options; return pending; };

  await assert.rejects(debitNoteService.assertChangeable(21), fails(409, /Debit note is cancelled/));
  await assert.rejects(debitNoteService.approveDebitNote(21, null, 9, false), fails(409, /Debit note is cancelled/));
  status = "approved";
  await debitNoteService.assertChangeable(21, "paid");
  assert.deepEqual(countWhere.where, { cancel_debit_note: true, status: ["requested", "reviewed", "verified"] });
  assert.deepEqual(countWhere.include[0].where, { id_debit_note: 21 });
  pending = 1;
  await assert.rejects(debitNoteService.assertChangeable(21, "paid"), fails(409, /cannot be paid while the cancellation/));
  await debitNoteService.assertChangeable(21, "rejected");
});
