// Cancellation of a paid invoice (or one with a tax invoice), fase A–B of
// docs/invoice-cancellation-paid.md, against in-memory tables (single database).
const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const service = require("../src/services/invoice/invoicePaidCancellation.service");
const invoiceService = require("../src/services/invoice/invoice.service");
const paymentRequestService = require("../src/services/paymentRequest/paymentRequest.service");
const creditNoteService = require("../src/services/creditNote/creditNote.service");
const debitNoteService = require("../src/services/debitNote/debitNote.service");
const fileService = require("../src/services/file.service");
const APPROVAL_TARGETS = require("../src/services/approvalFlow/approvalTargets");
const { models, db1 } = require("../src/models");

const proof = [{ original_name: "a.pdf", stored_name: "a.pdf", url: "/files/a.pdf", mime_type: "application/pdf", size: 1 }];

// A test may call it again for a fresh state; the real methods are kept once per
// test and put back after it.
const originals = new WeakMap();
function mockDb(t, tables) {
  if (!originals.has(t)) {
    const kept = new Map();
    originals.set(t, kept);
    t.after(() => { for (const [[target, key], value] of kept) target[key] = value; });
  }
  const kept = originals.get(t);
  const patch = (target, key, value) => {
    if (![...kept.keys()].some(([keptTarget, keptKey]) => keptTarget === target && keptKey === key))
      kept.set([target, key], target[key]);
    target[key] = value;
  };

  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (Array.isArray(value)) return value.includes(row[key]);
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if (Op.ne in value) return row[key] != value[Op.ne];
      if (Op.gt in value) return Number(row[key]) > value[Op.gt];
      return true; // other Op conditions
    }
    return (row[key] ?? null) == value;
  });
  const state = { files: [] };
  for (const name of ["Invoice", "InvoicePayment", "InvoicePaidCancellation", "InvoiceCancellation",
    "InvoiceVerificationProgress", "DebitNote", "DebitNoteVerificationProgress", "CreditNote",
    "CreditNoteAllocation", "Company", "PaymentRequest", "PaymentRequestVerificationProgress", "User"]) {
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
    patch(Model, "sum", async (field, { where } = {}) =>
      table.filter((item) => matches(item, where)).reduce((sum, row) => sum + Number(row[field]), 0));
    patch(Model, "create", async (data) => {
      const row = { id: Math.max(0, ...table.map((item) => item.id)) + 1, createdAt: new Date(), ...data };
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
  patch(service, "getById", async (id) => state.InvoicePaidCancellation.find((row) => row.id == id));
  patch(paymentRequestService, "getById", async (id) => state.PaymentRequest.find((row) => row.id == id));
  patch(creditNoteService, "getById", async (id) => state.CreditNote.find((row) => row.id == id));
  return state;
}

const fails = (status, pattern) => (error) =>
  error.statusCode === status && (!pattern || pattern.test(error.message));

// Invoice of 1,000,000 (PPN and PPh left out), paid in full, tax invoice issued.
const invoice = (data = {}) => ({
  id: 1, invoice_no: "006/INV/TYS/XI/2026", status: "paid & clear", tax_invoice_status: "issued",
  tax_invoice_no: "010.000-26.00000001", id_company: 3, id_customer: 4, currency_type: "idr",
  total: "1000000.00", payment_amount: "1000000.00", id_debit_note: null, id_invoice_converted_from: null,
  is_active: true, ...data,
});
const payment = (amount, data = {}) => ({ id_invoice: 1, amount: String(amount), status: "accepted", ...data });
const base = (invoiceData = {}, extra = {}) => ({
  Invoice: [invoice(invoiceData)],
  InvoicePayment: [{ id: 1, ...payment(1000000) }],
  ...extra,
});
const request = (data = {}) => ({
  service_condition: "not processed",
  reason: "Klien membatalkan kontrak",
  cancellation_attachment: proof,
  confirm_tax_invoice_cancel: true,
  settlement: "refund",
  refund_bank_name: "BCA",
  refund_account_name: "PT Klien",
  refund_account_number: "123",
  refund_letter: proof,
  tax_invoice_credited: false,
  ...data,
});
const progress = (state) => state.InvoiceVerificationProgress.map((row) => row.status);

test("the paid cancellation is offered once at least half is paid or the tax invoice exists", async (t) => {
  const check = async (invoiceData, payments) => {
    mockDb(t, { Invoice: [invoice(invoiceData)], InvoicePayment: payments });
    return service.preview(1);
  };
  const full = await check({}, [{ id: 1, ...payment(1000000) }]);
  assert.equal(full.is_eligible, true);
  assert.deepEqual([full.invoice_paid, full.invoice_kept, full.invoice_max_amount], [1000000, 500000, 500000]);
  assert.equal(full.needs_tax_invoice_confirmation, true);

  const partial = await check({ status: "waiting for payment" }, [{ id: 1, ...payment(700000) }]);
  assert.equal(partial.invoice_max_amount, 200000);

  const below = await check({ status: "waiting for payment" }, [{ id: 1, ...payment(300000) }]);
  assert.equal(below.is_eligible, false);
  assert.match(below.reasons[0], /at least 50% .*500000.*200000 more/);

  // A tax invoice without any payment still needs the 50% first (P1).
  const taxOnly = await check({ status: "waiting for payment" }, []);
  assert.match(taxOnly.reasons[0], /at least 50%/);

  // Nothing paid and no tax invoice: the unpaid cancellation (Tahap 5) applies.
  const unpaid = await check({ status: "waiting for payment", tax_invoice_status: "none" }, [
    { id: 1, ...payment(500000, { status: "rejected" }) },
  ]);
  assert.match(unpaid.reasons[0], /use the cancellation request of an unpaid invoice/);

  const busy = await check({ status: "wht verification" }, [{ id: 1, ...payment(1000000) }]);
  assert.match(busy.reasons[0], /not allowed while the invoice is wht verification/);
});

test("sales requests a refund and the invoice is locked until the request ends", async (t) => {
  const state = mockDb(t, base());
  const row = await service.request(1, request({ invoice_amount: 400000 }), 7, false);
  assert.equal(row.status, "waiting ar&ap review");
  assert.equal(row.previous_status, "paid & clear");
  assert.equal(row.settlement, "refund");
  assert.deepEqual([row.invoice_paid, row.invoice_kept, row.invoice_amount], [1000000, 500000, 400000]);
  assert.equal(row.tax_invoice_credited, false);
  assert.equal(state.Invoice[0].status, "paid cancellation in progress");
  assert.deepEqual(state.files.map((file) => file.category), ["cancellation_attachment", "refund_letter", "tax_return_note"]);
  assert.deepEqual(progress(state), ["paid cancellation requested"]);

  // The invoice cannot be cancelled twice, and its tax invoice cannot be uploaded meanwhile.
  await assert.rejects(service.request(1, request(), 7, false), fails(409, /paid cancellation in progress/));
  state.Invoice[0].tax_invoice_status = "requested";
  await assert.rejects(invoiceService.uploadTaxInvoice(1, { file_final_invoice: proof }, 7, false),
    fails(409, /being cancelled/));
});

test("a request follows the cancellation rules from the requirement document", async (t) => {
  mockDb(t, base());
  const rejects = (data, status, pattern) => assert.rejects(service.request(1, request(data), 7, false), fails(status, pattern));
  await rejects({ service_condition: "processed with certificate" }, 409, /must be paid in full/);
  await rejects({ service_condition: "processed without certificate" }, 409, /does not need to be billed/);
  await rejects({ service_condition: "unknown" }, 400, /service_condition must be one of/);
  await rejects({ confirm_tax_invoice_cancel: false }, 400, /tax invoice has been issued/);
  await rejects({ invoice_amount: 500001 }, 400, /cannot be more than 500000/);
  await rejects({ settlement: undefined }, 400, /settlement must be transfer or refund/);
  await rejects({ refund_letter: [] }, 400, /refund_letter/);
  await rejects({ tax_invoice_credited: true }, 400, /tax_return_note/);
  await rejects({ reason: " " }, 400, /reason is required/);
});

test("nothing to return needs no settlement", async (t) => {
  const state = mockDb(t, base({}, { InvoicePayment: [{ id: 1, ...payment(500000) }] }));
  const row = await service.request(1, request({ settlement: undefined, refund_letter: undefined }), 7, false);
  assert.deepEqual([row.invoice_amount, row.settlement, row.refund_bank_name], [0, "none", null]);
  assert.equal(state.files.filter((file) => file.category === "refund_letter").length, 1); // emptied list
});

test("a debit note continues or is cancelled in full, without the 50% rule", async (t) => {
  const debitNote = { id: 9, debit_note_no: "DN-9", status: "paid", total: "300000", payment_amount: "300000",
    id_customer: 4, id_company: 3, currency_type: "idr", is_active: true };
  let state = mockDb(t, base({ id_debit_note: 9 }, { DebitNote: [debitNote] }));
  await assert.rejects(service.request(1, request(), 7, false), fails(400, /cancel_debit_note must be a boolean/));
  const cancelled = await service.request(1, request({ cancel_debit_note: true }), 7, false);
  assert.deepEqual([cancelled.debit_note_paid, cancelled.debit_note_amount, cancelled.invoice_amount], [300000, 300000, 500000]);

  // While the request runs, the debit note cannot be paid elsewhere.
  state.DebitNote[0].status = "approved";
  await assert.rejects(debitNoteService.assertChangeable(9, "paid"), fails(409, /paid invoice/));

  state = mockDb(t, base({ id_debit_note: 9 }, { DebitNote: [debitNote] }));
  const continues = await service.request(1, request({ cancel_debit_note: false }), 7, false);
  assert.deepEqual([continues.cancel_debit_note, continues.debit_note_amount], [false, 0]);
});

test("a transfer goes to outstanding documents of the same customer; the rest is a deposit", async (t) => {
  const other = (id, data) => invoice({ id, invoice_no: `00${id}/INV`, status: "waiting for payment",
    tax_invoice_status: "none", total: "300000", payment_amount: "100000", ...data });
  const dn = (id, data) => ({ id, debit_note_no: `DN-${id}`, status: "approved", total: "50000", id_customer: 4,
    id_company: 3, currency_type: "idr", is_active: true, ...data });
  const state = mockDb(t, base({ id_debit_note: 20 }, {
    Invoice: [invoice({ id_debit_note: 20 }), other(2), other(3, { id_customer: 99 }), other(4, { currency_type: "rmb" })],
    DebitNote: [{ ...dn(20), status: "paid", payment_amount: "50000" }, dn(21)],
  }));
  const preview = await service.preview(1);
  assert.deepEqual(preview.transfer_targets.invoices.map((row) => [row.id, row.remaining]), [[2, 200000]]);
  assert.deepEqual(preview.transfer_targets.debit_notes.map((row) => row.id), [21]);

  const transfer = (targets) => request({ settlement: "transfer", cancel_debit_note: true, transfer_targets: targets });
  const rejects = (targets, pattern) => assert.rejects(service.request(1, transfer(targets), 7, false), fails(400, pattern));
  await rejects([{ type: "invoice", id: 3, amount: 1 }], /not an outstanding invoice of the same customer/);
  await rejects([{ type: "invoice", id: 2, amount: 200001 }], /cannot be more than its remaining 200000/);
  await rejects([{ type: "debit_note", id: 21, amount: 10000 }], /must pay the debit note in full/);
  await rejects([{ type: "invoice", id: 2, amount: 1 }, { type: "invoice", id: 2, amount: 1 }], /listed twice/);

  const row = await service.request(1, transfer([
    { type: "invoice", id: 2, amount: 150000 },
    { type: "debit_note", id: 21, amount: 50000 },
  ]), 7, false);
  assert.equal(row.settlement, "transfer");
  assert.deepEqual(row.transfer_targets, [
    { type: "invoice", id: 2, amount: 150000 },
    { type: "debit_note", id: 21, amount: 50000 },
  ]);
  assert.equal(state.Invoice[0].status, "paid cancellation in progress");
});

test("AR & AP, SPV FAT Internal, the vice director and the director approve in turn", async (t) => {
  const state = mockDb(t, base());
  const { id } = await service.request(1, request({ settlement: undefined, invoice_amount: 0 }), 7, false);
  const statuses = [];
  for (const user of [11, 12, 13, 14]) {
    const row = await service.approve(id, "ok", user, false);
    statuses.push(row.status);
  }
  assert.deepEqual(statuses, [
    "waiting spv fat internal approval",
    "waiting vice director approval",
    "waiting director approval",
    "completed",
  ]);
  const row = state.InvoicePaidCancellation[0];
  assert.deepEqual([row.id_user_review, row.id_user_verify, row.id_user_vice_approve, row.id_user_approve], [11, 12, 13, 14]);
  // Nothing to return: the director's approval cancels the invoice and its tax invoice.
  assert.deepEqual([state.Invoice[0].status, state.Invoice[0].tax_invoice_status], ["cancelled", "cancelled"]);
  assert.ok(row.completed_at);
  assert.deepEqual(progress(state).slice(-2), ["paid cancellation approved", "paid cancellation completed"]);
  await assert.rejects(service.approve(id, null, 14, false), fails(409, /while the cancellation is completed/));
});

test("the director's approval waits for the transfer or the refund", async (t) => {
  for (const [data, next] of [
    [{}, "waiting for refund process"],
    [{ settlement: "transfer" }, "waiting for payment transfer"],
  ]) {
    const state = mockDb(t, base());
    const { id } = await service.request(1, request(data), 7, false);
    for (const user of [11, 12, 13, 14]) await service.approve(id, null, user, false);
    assert.equal(state.InvoicePaidCancellation[0].status, next);
    assert.equal(state.Invoice[0].status, "paid cancellation in progress");
  }
});

test("a cancelled debit note is cancelled when the request completes", async (t) => {
  const state = mockDb(t, base({ id_debit_note: 9 }, {
    InvoicePayment: [{ id: 1, ...payment(500000) }],
    DebitNote: [{ id: 9, debit_note_no: "DN-9", status: "approved", total: "300000", is_active: true }],
  }));
  const { id } = await service.request(1, request({ settlement: undefined, cancel_debit_note: true }), 7, false);
  for (const user of [11, 12, 13, 14]) await service.approve(id, null, user, false);
  assert.equal(state.DebitNote[0].status, "cancelled");
  assert.deepEqual(state.DebitNoteVerificationProgress.map((row) => row.status), ["cancelled"]);
});

test("AR & AP rejects to sales and may hold; later steps reject one step back", async (t) => {
  const state = mockDb(t, base());
  const { id } = await service.request(1, request(), 7, false);
  await assert.rejects(service.reject(id, " ", undefined, 11, false), fails(400, /note is required/));
  await assert.rejects(service.hold(id, "", 11, false), fails(400, /note is required/));

  assert.equal((await service.hold(id, "Invoice 002 belum lunas", 11, false)).status, "waiting outstanding settlement");
  assert.equal((await service.reject(id, "Bukti kurang", proof, 11, false)).status, "rejected");
  assert.equal(state.files.at(-1).category, "paid_cancellation_reject_attachment");
  await assert.rejects(service.approve(id, null, 11, false), fails(409, /while the cancellation is rejected/));

  // Sales sends it again with a lower amount.
  const again = await service.resubmit(id, request({ invoice_amount: 100000 }), 7, false);
  assert.deepEqual([again.status, again.invoice_amount, again.note], ["waiting ar&ap review", 100000, null]);

  await service.approve(id, null, 11, false);
  assert.equal((await service.reject(id, "Cek lagi", undefined, 12, false)).status, "waiting ar&ap review");
  await service.approve(id, null, 11, false);
  await service.approve(id, null, 12, false);
  assert.equal((await service.reject(id, "Kurang", undefined, 13, false)).status, "waiting spv fat internal approval");
  await service.approve(id, null, 12, false);
  await service.approve(id, null, 13, false);
  assert.equal((await service.reject(id, "Kurang", undefined, 14, false)).status, "waiting vice director approval");
  assert.ok(progress(state).includes("paid cancellation held"));
});

test("sales withdraws a rejected request and the invoice gets its status back", async (t) => {
  const state = mockDb(t, base({ status: "paid waiting wht" }));
  const { id } = await service.request(1, request(), 7, false);
  await assert.rejects(service.withdraw(id, null, 7, false), fails(409, /while the cancellation is waiting ar&ap review/));
  await service.reject(id, "Tidak sesuai", undefined, 11, false);
  const row = await service.withdraw(id, null, 7, false);
  assert.equal(row.status, "withdrawn");
  assert.equal(state.Invoice[0].status, "paid waiting wht");
  assert.equal(progress(state).at(-1), "paid cancellation withdrawn");
  // A new request is allowed afterwards.
  assert.equal((await service.request(1, request(), 7, false)).status, "waiting ar&ap review");
});

test("My Task lists the requests and hides the tax invoice task of a locked invoice", () => {
  const target = APPROVAL_TARGETS["invoice paid cancellation"];
  assert.equal(target.model, "InvoicePaidCancellation");
  assert.ok(service.APPROVAL_STATUSES.every((status) => status in target.statuses));
  assert.ok(!("waiting for cashier payment" in target.statuses));
  assert.deepEqual(APPROVAL_TARGETS["invoice tax invoice"].baseWhere.status, { [Op.ne]: "paid cancellation in progress" });
});

test("an unpaid cancellation (Tahap 5) ignores rejected payment proofs", async (t) => {
  const kept = invoiceService.getById;
  invoiceService.getById = async () => ({});
  t.after(() => { invoiceService.getById = kept; });
  const state = mockDb(t, {
    Invoice: [invoice({ status: "waiting for payment", tax_invoice_status: "none", payment_amount: "0" })],
    InvoicePayment: [{ id: 1, ...payment(500000, { status: "rejected" }) }],
  });
  await invoiceService.requestCancellation(1, { type: "cancel", reason: "Batal", cancellation_attachment: proof }, 7, false);
  assert.equal(state.Invoice[0].status, "cancellation requested");

  const accepted = mockDb(t, {
    Invoice: [invoice({ status: "waiting for payment", tax_invoice_status: "none" })],
    InvoicePayment: [{ id: 1, ...payment(500000) }],
  });
  await assert.rejects(
    invoiceService.requestCancellation(1, { type: "cancel", reason: "Batal", cancellation_attachment: proof }, 7, false),
    fails(409, /use the paid invoice cancellation/),
  );
  assert.equal(accepted.Invoice[0].status, "waiting for payment");
});

// Fase C: payment transfer with credit notes (7A).
const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"][new Date().getMonth()];
const transferSetup = async (t, extra = {}) => {
  const state = mockDb(t, {
    Invoice: [
      invoice({ id_debit_note: 20 }),
      invoice({ id: 2, invoice_no: "002/INV", status: "waiting for payment", tax_invoice_status: "none",
        total: "300000", payment_amount: "100000" }),
    ],
    InvoicePayment: [{ id: 1, ...payment(1000000) }, { id: 2, ...payment(100000, { id_invoice: 2 }) }],
    DebitNote: [
      { id: 20, debit_note_no: "DN-20", status: "paid", total: "50000", payment_amount: "50000", id_customer: 4,
        id_company: 3, currency_type: "idr", is_active: true },
      { id: 21, debit_note_no: "DN-21", status: "approved", total: "50000", id_customer: 4, id_company: 3,
        currency_type: "idr", is_active: true, id_payment_request: 77 },
    ],
    PaymentRequest: [{ id: 77, status: "continue_to_debit_note" }],
    Company: [{ id: 3, initial_company: "tys" }],
    ...extra,
  });
  const { id } = await service.request(1, request({ settlement: "transfer", cancel_debit_note: true }), 7, false);
  for (const user of [11, 12, 13, 14]) await service.approve(id, null, user, false);
  assert.equal(state.InvoicePaidCancellation[0].status, "waiting for payment transfer");
  return { state, id };
};
const allocation = (type, id, amount) => ({ type, id, amount, payment_proof: proof });

test("AR & AP opens credit notes, pays outstanding documents and keeps the rest as a deposit", async (t) => {
  const { state, id } = await transferSetup(t);
  await service.processTransfer(id, {
    transfer_proof: proof,
    transfer_date: "2026-11-24",
    allocations: [allocation("invoice", 2, 200000), allocation("debit_note", 21, 50000)],
  }, 15, false);

  // One credit note per cancelled document: invoice money and debit note money apart.
  assert.deepEqual(state.CreditNote.map((row) => [row.credit_note_no, row.source_type, row.amount, row.balance]), [
    [`001/CN/TYS/${roman}/${new Date().getFullYear()}`, "invoice", 500000, 300000],
    [`002/CN/TYS/${roman}/${new Date().getFullYear()}`, "debit_note", 50000, 0],
  ]);
  assert.deepEqual(state.CreditNote.map((row) => [row.id_customer, row.id_debit_note]), [[4, null], [4, 20]]);

  // The outstanding invoice gets an accepted payment and is paid off.
  const paid = state.InvoicePayment.at(-1);
  assert.deepEqual([paid.id_invoice, paid.amount, paid.payment_method, paid.status, paid.id_credit_note],
    [2, 200000, "credit note", "accepted", 1]);
  assert.deepEqual([state.Invoice[1].status, state.Invoice[1].payment_amount, state.Invoice[1].tax_invoice_status],
    ["paid & clear", 300000, "requested"]);
  // The outstanding debit note is paid in full, with its payment request.
  assert.deepEqual([state.DebitNote[1].status, state.DebitNote[1].payment_amount], ["paid", 50000]);
  assert.equal(state.PaymentRequest[0].status, "paid");

  assert.deepEqual(state.CreditNoteAllocation.map((row) => [row.id_credit_note, row.target_type, row.amount, row.type]), [
    [1, "invoice", 200000, "transfer"],
    [2, "debit_note", 50000, "transfer"],
  ]);
  assert.deepEqual(
    state.files.filter((file) => ["transfer_proof", "payment_proof"].includes(file.category)).map((file) => file.type),
    ["invoice_payments", "credit_note_allocations", "credit_note_allocations", "invoice_paid_cancellations"],
  );

  // The source invoice and its debit note are cancelled; the request is completed.
  assert.deepEqual([state.Invoice[0].status, state.Invoice[0].tax_invoice_status], ["cancelled", "cancelled"]);
  assert.equal(state.DebitNote[0].status, "cancelled");
  assert.equal(state.InvoicePaidCancellation[0].status, "completed");
  assert.match(state.InvoiceVerificationProgress.at(-1).note, /payment transferred, credit note 001\/CN.* 500000 \(deposit 300000\)/);
});

test("an empty allocation keeps all the money as a deposit", async (t) => {
  const { state, id } = await transferSetup(t);
  await service.processTransfer(id, { transfer_proof: proof, allocations: [] }, 15, false);
  assert.deepEqual(state.CreditNote.map((row) => [row.amount, row.balance]), [[500000, 500000], [50000, 50000]]);
  assert.equal(state.CreditNoteAllocation.length, 0);
  assert.equal(state.Invoice[1].status, "waiting for payment");
  assert.equal(state.InvoicePaidCancellation[0].status, "completed");
});

test("a payment transfer checks its proofs, its amounts and its targets again", async (t) => {
  const { state, id } = await transferSetup(t);
  const rejects = (data, status, pattern) =>
    assert.rejects(service.processTransfer(id, { transfer_proof: proof, allocations: [], ...data }, 15, false), fails(status, pattern));
  await rejects({ transfer_proof: [] }, 400, /transfer_proof/);
  await rejects({ allocations: undefined }, 400, /allocations must be an array/);
  await rejects({ allocations: [{ type: "invoice", id: 2, amount: 1 }] }, 400, /payment_proof/);
  await rejects({ allocations: [allocation("invoice", 2, 200001)] }, 400, /remaining 200000/);
  await rejects({ transfer_date: "nope" }, 400, /transfer_date/);
  // A target paid meanwhile is no longer outstanding.
  state.DebitNote[1].status = "paid";
  await rejects({ allocations: [allocation("debit_note", 21, 50000)] }, 400, /not an outstanding debit note/);
  assert.equal(state.CreditNote.length, 0);
  assert.equal(state.InvoicePaidCancellation[0].status, "waiting for payment transfer");
});

test("a payment transfer only runs once the director approved a transfer", async (t) => {
  mockDb(t, base());
  const { id } = await service.request(1, request({ settlement: "transfer" }), 7, false);
  await assert.rejects(service.processTransfer(id, { transfer_proof: proof, allocations: [] }, 15, false),
    fails(409, /while the cancellation is waiting ar&ap review/));
});

// Fase D: refund through a payment request paid by the cashier (7B).
const refundSetup = async (t, data = {}) => {
  const state = mockDb(t, {
    Invoice: [invoice({ id_debit_note: 20 })],
    InvoicePayment: [{ id: 1, ...payment(1000000) }],
    DebitNote: [{ id: 20, debit_note_no: "DN-20", status: "paid", total: "50000", payment_amount: "50000", is_active: true }],
    Company: [{ id: 3, initial_company: "tys" }],
    User: [{ id: 15, id_department: 2 }],
    PaymentRequest: [],
  });
  const { id } = await service.request(1, request({ cancel_debit_note: true, invoice_amount: 400000, ...data }), 7, false);
  for (const user of [11, 12, 13, 14]) await service.approve(id, null, user, false);
  assert.equal(state.InvoicePaidCancellation[0].status, "waiting for refund process");
  return { state, id };
};

test("AR & AP makes the refund payment request, straight to the cashier", async (t) => {
  const { state, id } = await refundSetup(t);
  await assert.rejects(service.createRefund(id, { priority: "now" }, 15, false), fails(400, /priority/));
  const row = await service.createRefund(id, {}, 15, false);
  const request = state.PaymentRequest[0];
  assert.equal(request.payment_request_no, `PRQ-TYS-${new Date().getFullYear()}-00001`);
  assert.deepEqual(
    [request.payment_type, request.status, request.total_payment_request, request.id_invoice_paid_cancellation],
    ["refund", "approve cashier", 450000, id],
  );
  assert.deepEqual([request.bank_name, request.account_name, request.account_number], ["BCA", "PT Klien", "123"]);
  assert.deepEqual([request.id_company, request.id_customer, request.id_department_request], [3, 4, 2]);
  assert.match(request.description, /006\/INV\/TYS\/XI\/2026 and DN-20: invoice 400000; debit note 50000/);
  assert.equal(state.PaymentRequestVerificationProgress[0].status, "requested");
  assert.deepEqual([row.status, row.id_payment_request], ["waiting for cashier payment", request.id]);
  assert.equal(progress(state).at(-1), "paid cancellation refund requested");
  await assert.rejects(service.createRefund(id, {}, 15, false), fails(409, /waiting for cashier payment/));
});

test("the cashier's payment completes the cancellation", async (t) => {
  const { state, id } = await refundSetup(t);
  await service.createRefund(id, {}, 15, false);
  await paymentRequestService.paidPaymentRequest(1, 450000, "/files/refund.pdf", "Transfer BCA", 16, false);
  assert.deepEqual([state.PaymentRequest[0].status, state.PaymentRequest[0].total_payment], ["paid", 450000]);
  assert.equal(state.InvoicePaidCancellation[0].status, "completed");
  assert.deepEqual([state.Invoice[0].status, state.Invoice[0].tax_invoice_status], ["cancelled", "cancelled"]);
  assert.equal(state.DebitNote[0].status, "cancelled");
  assert.match(state.InvoiceVerificationProgress.at(-1).note, /refunded through payment request PRQ-TYS-\d{4}-00001/);
});

test("a cashier rejection sends the refund back to AR & AP, who makes it again", async (t) => {
  const { state, id } = await refundSetup(t);
  await service.createRefund(id, {}, 15, false);
  await paymentRequestService.rejectPaymentRequest("cashier", 1, "Rekening tidak ditemukan", 16, false);
  const row = state.InvoicePaidCancellation[0];
  assert.deepEqual([row.status, row.id_payment_request, row.note],
    ["waiting for refund process", null, "Rekening tidak ditemukan"]);
  assert.equal(state.Invoice[0].status, "paid cancellation in progress");

  // AR & AP corrects the account and makes a new request.
  await service.createRefund(id, { refund_account_number: "456" }, 15, false);
  assert.deepEqual(state.PaymentRequest.map((request) => [request.id, request.account_number]), [[1, "123"], [2, "456"]]);
  assert.equal(state.InvoicePaidCancellation[0].refund_account_number, "456");
  // The rejected request no longer settles anything.
  await assert.rejects(paymentRequestService.paidPaymentRequest(1, 450000, "/f.pdf", null, 16, false),
    fails(409, /no longer waits for the cashier/));
});

test("a refund payment request cannot be edited, deleted or approved", async (t) => {
  const { state, id } = await refundSetup(t);
  await service.createRefund(id, {}, 15, false);
  await assert.rejects(paymentRequestService.updateFiles(1, [], 15, false), fails(409, /cannot be edited or deleted/));
  await assert.rejects(paymentRequestService.assertEditable(1), fails(409));
  await assert.rejects(paymentRequestService.approvePaymentRequest("cashier", 1, null, 16, false),
    fails(409, /only waits for the cashier's payment/));
  assert.equal(state.PaymentRequest[0].status, "approve cashier");
});

// Fase E: the deposit balance pays later invoices and debit notes (P8, P15, P16).
const creditNote = (data) => ({ id: 1, credit_note_no: "001/CN/TYS/XI/2026", id_customer: 4, id_company: 3,
  currency_type: "idr", source_type: "invoice", amount: "500000", balance: "300000", date: new Date("2026-11-01"),
  is_active: true, ...data });
const depositSetup = (t, extra = {}) => mockDb(t, {
  Invoice: [invoice({ id: 5, invoice_no: "005/INV", status: "waiting for payment", tax_invoice_status: "none",
    total: "400000", payment_amount: "0" })],
  InvoicePayment: [],
  DebitNote: [{ id: 30, debit_note_no: "DN-30", status: "approved", total: "50000", id_customer: 4, id_company: 3,
    currency_type: "idr", is_active: true }],
  CreditNote: [
    creditNote(),
    creditNote({ id: 2, credit_note_no: "002/CN", source_type: "debit_note", amount: "80000", balance: "80000" }),
    creditNote({ id: 3, credit_note_no: "003/CN", id_customer: 99 }),
    creditNote({ id: 4, credit_note_no: "004/CN", balance: "0" }),
  ],
  ...extra,
});

test("a document lists the deposits of the same customer and kind it may use", async (t) => {
  depositSetup(t);
  const forInvoice = await creditNoteService.deposits("invoice", 5);
  assert.deepEqual(forInvoice.credit_notes.map((row) => row.id), [1]);
  assert.deepEqual([forInvoice.remaining, forInvoice.must_pay_in_full], [400000, false]);
  const forDebitNote = await creditNoteService.deposits("debit_note", 30);
  assert.deepEqual(forDebitNote.credit_notes.map((row) => row.id), [2]);
  assert.equal(forDebitNote.must_pay_in_full, true);
  await assert.rejects(creditNoteService.deposits("receipt", 5), fails(400, /target_type/));
});

test("AR & AP pays an invoice from a deposit; the balance goes down", async (t) => {
  const state = depositSetup(t);
  await creditNoteService.useDeposit("invoice", 5, { id_credit_note: 1, amount: 100000, payment_proof: proof }, 15, false);
  const paid = state.InvoicePayment.at(-1);
  assert.deepEqual([paid.amount, paid.payment_method, paid.status, paid.id_credit_note], [100000, "credit note", "accepted", 1]);
  assert.deepEqual([state.Invoice[0].status, state.Invoice[0].payment_amount], ["waiting for payment", 100000]);
  assert.equal(state.CreditNote[0].balance, 200000);
  assert.deepEqual(state.CreditNoteAllocation.map((row) => [row.type, row.target_type, row.id_invoice, row.amount]),
    [["deposit", "invoice", 5, 100000]]);
  assert.match(paid.note, /Paid from the deposit of credit note 001\/CN/);

  // The rest of the deposit pays it off.
  state.Invoice[0].total = "300000";
  await creditNoteService.useDeposit("invoice", 5, { id_credit_note: 1, amount: 200000 }, 15, false);
  assert.deepEqual([state.Invoice[0].status, state.CreditNote[0].balance], ["paid & clear", 0]);
});

test("a deposit pays a debit note in full, only from debit note money", async (t) => {
  const state = depositSetup(t);
  await assert.rejects(creditNoteService.useDeposit("debit_note", 30, { id_credit_note: 1, amount: 50000 }, 15, false),
    fails(400, /from an invoice can only pay an invoice/));
  await assert.rejects(creditNoteService.useDeposit("debit_note", 30, { id_credit_note: 2, amount: 10000 }, 15, false),
    fails(400, /must be paid in full \(50000\)/));
  await creditNoteService.useDeposit("debit_note", 30, { id_credit_note: 2, amount: 50000 }, 15, false);
  assert.deepEqual([state.DebitNote[0].status, state.DebitNote[0].payment_amount], ["paid", 50000]);
  assert.equal(state.CreditNote[1].balance, 30000);
});

test("a deposit stays within its balance, its customer and the document's remaining", async (t) => {
  const state = depositSetup(t);
  const rejects = (data, status, pattern) =>
    assert.rejects(creditNoteService.useDeposit("invoice", 5, data, 15, false), fails(status, pattern));
  await rejects({ id_credit_note: 3, amount: 1 }, 400, /another customer, company or currency/);
  await rejects({ id_credit_note: 1, amount: 300001 }, 400, /deposit 300000/);
  await rejects({ id_credit_note: 1, amount: 0 }, 400, /amount must be more than 0/);
  await rejects({ id_credit_note: 99, amount: 1 }, 404, /Credit note not found/);
  state.Invoice[0].total = "100000";
  await rejects({ id_credit_note: 1, amount: 100001 }, 400, /remaining 100000/);
  state.Invoice[0].status = "payment verification";
  await rejects({ id_credit_note: 1, amount: 1 }, 409, /cannot pay an invoice that is payment verification/);
  assert.equal(state.CreditNote[0].balance, "300000");
});
