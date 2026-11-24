// Cancellation of an invoice that is already paid (at least 50%) and/or whose tax
// invoice was requested or issued: FAT Internal "Tahapan Cancel Invoice yang Sudah
// Bayar / Terbit Faktur Pajak". Design and decisions: docs/invoice-cancellation-paid.md.
// Fase A (request) and B (approvals) live here; the transfer (credit note, fase C)
// and refund (payment request, fase D) settle the requests the director approved.
const { Op } = require("sequelize");
const { models } = require("../../models");
const invoiceService = require("./invoice.service");
const creditNoteService = require("../creditNote/creditNote.service");
const approvalAccess = require("../approvalFlow/approvalAccess.service");
const {
  fail,
  withTransactions,
  mirrorCreate,
  mirrorUpdate,
  syncFiles,
} = require("../procurement/shared");
const {
  SERVICE_CONDITIONS,
  OPEN_PAID_CANCELLATION_STATUSES,
} = require("../../models/invoice/invoicePaidCancellation.model");
const { OPEN_CANCELLATION_STATUSES } = require("../../models/invoice/invoiceCancellation.model");
const { CREDIT_NOTE_SOURCES } = require("../../models/creditNote/creditNote.model");

const APPROVAL_FOR = "invoice paid cancellation";
// Invoice statuses a paid cancellation may start from (R1). Statuses where someone
// else is acting (payment or withholding tax verification, revision) are left out.
const ELIGIBLE_STATUSES = [
  "waiting for payment",
  "payment proof rejected",
  "paid waiting wht",
  "wht rejected",
  "paid & clear",
];
// Invoice status while a request runs: every other invoice action is refused.
const LOCK_STATUS = "paid cancellation in progress";
// The company keeps this share of the invoice total (answer to Tahap 5 no. 1).
const KEPT_RATE = 0.5;
// Outstanding documents money may move to (R5).
const { TARGET_INVOICE_STATUSES } = creditNoteService;
const TARGET_TYPES = ["invoice", "debit_note"];
const CONDITION_RULES = {
  "processed without certificate":
    "A service already processed without its certificate cannot be cancelled; the remaining payment does not need to be billed",
  "processed with certificate":
    "A service already processed with its certificate issued cannot be cancelled and must be paid in full",
};

// Approval steps (R6): who acts, where approve and reject lead, and who/when is kept.
const steps = {
  "waiting ar&ap review": {
    role: "AR & AP",
    next: "waiting spv fat internal approval",
    reject: "rejected",
    row: (idUser) => ({ id_user_review: idUser, reviewed_at: new Date() }),
  },
  "waiting outstanding settlement": {
    role: "AR & AP",
    next: "waiting spv fat internal approval",
    reject: "rejected",
    row: (idUser) => ({ id_user_review: idUser, reviewed_at: new Date() }),
  },
  "waiting spv fat internal approval": {
    role: "SPV FAT Internal",
    next: "waiting vice director approval",
    reject: "waiting ar&ap review",
    row: (idUser) => ({ id_user_verify: idUser, verified_at: new Date() }),
  },
  "waiting vice director approval": {
    role: "Vice Director",
    next: "waiting director approval",
    reject: "waiting spv fat internal approval",
    row: (idUser) => ({ id_user_vice_approve: idUser, vice_approved_at: new Date() }),
  },
  "waiting director approval": {
    role: "Director",
    next: null, // depends on the settlement, see afterDirector
    reject: "waiting vice director approval",
    row: (idUser) => ({ id_user_approve: idUser, approved_at: new Date() }),
  },
};
const APPROVAL_STATUSES = Object.keys(steps);
const afterDirector = {
  transfer: "waiting for payment transfer",
  refund: "waiting for refund process",
  none: "completed",
};

// Money is compared in cents so 50% of an odd total stays exact.
const cents = (value) => Math.round(Number(value || 0) * 100);
const fromCents = (value) => value / 100;

const isNonEmptyArray = (value) => Array.isArray(value) && value.length > 0;
const plain = (row) => (row?.toJSON ? row.toJSON() : row);
const userAttributes = ["id", "name", "email"];

class InvoicePaidCancellationService {
  /**
   * Figures and problems of an invoice for a paid cancellation (R1, R3).
   * status overrides the invoice status, for a request sent again while the
   * invoice is locked by it.
   */
  async evaluate(invoice, t1, status = invoice.status) {
    const problems = [];
    const totalCents = cents(invoice.total);
    const paidCents = cents(await invoiceService._acceptedAmount(invoice.id, t1));
    const keptCents = Math.ceil(totalCents * KEPT_RATE);
    if (!ELIGIBLE_STATUSES.includes(status))
      problems.push([409, `Paid cancellation is not allowed while the invoice is ${status}`]);
    if (invoice.id_invoice_converted_from)
      problems.push([409, "An invoice converted to 50% cannot be cancelled"]);
    if (!paidCents && invoice.tax_invoice_status === "none")
      problems.push([
        409,
        "The invoice has no accepted payment and no tax invoice: use the cancellation request of an unpaid invoice",
      ]);
    else if (paidCents < keptCents)
      problems.push([
        409,
        `The client must pay at least 50% of the invoice (${fromCents(keptCents)}) before it is cancelled; ${fromCents(
          keptCents - paidCents,
        )} more is needed`,
      ]);
    return {
      problems,
      invoice_total: fromCents(totalCents),
      invoice_paid: fromCents(paidCents),
      invoice_kept: fromCents(keptCents),
      invoice_max_amount: fromCents(Math.max(0, paidCents - keptCents)),
    };
  }

  // Debit notes that are, or will be, cancelled with an invoice whose request is open.
  async _lockedDebitNoteIds(t1, exceptCancellationId = null) {
    const [paid, unpaid] = await Promise.all([
      models.db1.InvoicePaidCancellation.findAll({
        where: {
          cancel_debit_note: true,
          status: OPEN_PAID_CANCELLATION_STATUSES,
          ...(exceptCancellationId && { id: { [Op.ne]: exceptCancellationId } }),
        },
        attributes: ["id_debit_note"],
        transaction: t1,
      }),
      models.db1.InvoiceCancellation.findAll({
        where: { cancel_debit_note: true, status: OPEN_CANCELLATION_STATUSES },
        include: [{ model: models.db1.Invoice, as: "invoice", attributes: ["id_debit_note"] }],
        transaction: t1,
      }),
    ]);
    return new Set(
      [...paid.map((row) => row.id_debit_note), ...unpaid.map((row) => row.invoice?.id_debit_note)].filter(Boolean),
    );
  }

  /**
   * Outstanding invoices and debit notes of the same customer, company and
   * currency that money may move to (R5): invoices still to be paid, and approved
   * debit notes not yet paid. A debit note is paid off in full by a transfer (P6).
   */
  async outstandingTargets(invoice, t1, exceptCancellationId = null) {
    const same = {
      id_customer: invoice.id_customer,
      id_company: invoice.id_company,
      currency_type: invoice.currency_type,
      is_active: true,
    };
    const [invoices, debitNotes, locked] = await Promise.all([
      models.db1.Invoice.findAll({
        where: { ...same, status: TARGET_INVOICE_STATUSES, id: { [Op.ne]: invoice.id } },
        attributes: ["id", "invoice_no", "date", "due_date", "status", "total", "payment_amount", "id_contract", "id_pre_order"],
        order: [["date", "ASC"], ["id", "ASC"]],
        transaction: t1,
      }),
      models.db1.DebitNote.findAll({
        where: { ...same, status: "approved" },
        attributes: ["id", "debit_note_no", "date", "status", "total", "id_contract", "id_pre_order"],
        order: [["date", "ASC"], ["id", "ASC"]],
        transaction: t1,
      }),
      this._lockedDebitNoteIds(t1, exceptCancellationId),
    ]);
    return {
      invoices: invoices
        .map(plain)
        .map((row) => ({ ...row, remaining: fromCents(cents(row.total) - cents(row.payment_amount)) }))
        .filter((row) => row.remaining > 0),
      debit_notes: debitNotes
        .map(plain)
        .filter((row) => row.id !== invoice.id_debit_note && !locked.has(row.id))
        .map((row) => ({ ...row, remaining: Number(row.total) })),
    };
  }

  // The linked debit note, if it is still active and not cancelled.
  async _debitNote(invoice, t1) {
    if (!invoice.id_debit_note) return null;
    const debitNote = await models.db1.DebitNote.findOne({
      where: { id: invoice.id_debit_note, is_active: true },
      transaction: t1,
    });
    return debitNote && debitNote.status !== "cancelled" ? plain(debitNote) : null;
  }

  /**
   * What sales needs before requesting (R5): whether the invoice may be cancelled
   * and why not, the amounts, the debit note and tax invoice pop ups, and the
   * documents money may move to.
   */
  async preview(id) {
    const invoice = await models.db1.Invoice.findOne({ where: { id, is_active: true } });
    if (!invoice) fail("Invoice not found", 404);
    const { problems, ...figures } = await this.evaluate(invoice);
    const debitNote = await this._debitNote(invoice);
    const locked = debitNote ? await this._lockedDebitNoteIds() : new Set();
    return {
      id_invoice: invoice.id,
      invoice_no: invoice.invoice_no,
      is_eligible: problems.length === 0,
      reasons: problems.map(([, message]) => message),
      ...figures,
      tax_invoice_status: invoice.tax_invoice_status,
      needs_tax_invoice_confirmation: invoice.tax_invoice_status === "issued",
      debit_note: debitNote && {
        id: debitNote.id,
        debit_note_no: debitNote.debit_note_no,
        status: debitNote.status,
        total: Number(debitNote.total),
        // Paid in full when cancelled too: no 50% rule for a debit note (P5).
        amount_if_cancelled: debitNote.status === "paid" ? this._debitNotePaid(debitNote) : 0,
        can_be_cancelled: !locked.has(debitNote.id),
      },
      transfer_targets: await this.outstandingTargets(invoice),
    };
  }

  _debitNotePaid(debitNote) {
    return Number(debitNote.payment_amount || debitNote.total || 0);
  }

  /**
   * Checks a request body against the invoice (R2–R5) and returns the request
   * columns and files. figures come from evaluate.
   */
  async _validate(invoice, data, figures, t1, exceptCancellationId = null) {
    if (!SERVICE_CONDITIONS.includes(data.service_condition))
      fail(`service_condition must be one of: ${SERVICE_CONDITIONS.join(", ")}`);
    if (CONDITION_RULES[data.service_condition]) fail(CONDITION_RULES[data.service_condition], 409);
    const reason = data.reason?.toString().trim();
    if (!reason) fail("reason is required");
    if (!isNonEmptyArray(data.cancellation_attachment))
      fail("cancellation_attachment must be a non-empty array");
    if (invoice.tax_invoice_status === "issued" && data.confirm_tax_invoice_cancel !== true)
      fail("confirm_tax_invoice_cancel must be true: the tax invoice has been issued and will be cancelled too");

    // Debit note (R4): sales chooses whether it is cancelled too or continues.
    const debitNote = await this._debitNote(invoice, t1);
    let cancelDebitNote = false;
    let debitNotePaidCents = 0;
    if (debitNote) {
      if (typeof data.cancel_debit_note !== "boolean")
        fail("cancel_debit_note must be a boolean: the invoice has a debit note");
      cancelDebitNote = data.cancel_debit_note;
      if (cancelDebitNote) {
        if ((await this._lockedDebitNoteIds(t1, exceptCancellationId)).has(debitNote.id))
          fail("The debit note is already being cancelled with another request", 409);
        if (debitNote.status === "paid") debitNotePaidCents = cents(this._debitNotePaid(debitNote));
      }
    }

    // Amounts (R3): the invoice money is at most paid - 50%; the debit note's is all of it.
    const maxCents = cents(figures.invoice_max_amount);
    let invoiceCents = maxCents;
    if (data.invoice_amount !== undefined && data.invoice_amount !== null && data.invoice_amount !== "") {
      const amount = Number(data.invoice_amount);
      if (!Number.isFinite(amount) || amount < 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6)
        fail("invoice_amount must be a number of 0 or more with at most 2 decimals");
      invoiceCents = Math.round(amount * 100);
      if (invoiceCents > maxCents)
        fail(`invoice_amount cannot be more than ${fromCents(maxCents)} (payments above the 50% kept)`);
    }
    const row = {
      service_condition: data.service_condition,
      reason,
      id_debit_note: debitNote?.id ?? null,
      cancel_debit_note: cancelDebitNote,
      invoice_total: figures.invoice_total,
      invoice_paid: figures.invoice_paid,
      invoice_kept: figures.invoice_kept,
      invoice_amount: fromCents(invoiceCents),
      debit_note_paid: fromCents(debitNotePaidCents),
      debit_note_amount: fromCents(debitNotePaidCents),
      settlement: "none",
      transfer_targets: null,
      refund_bank_name: null,
      refund_account_name: null,
      refund_account_number: null,
      tax_invoice_credited: null,
    };
    const files = { cancellation_attachment: data.cancellation_attachment, refund_letter: [], tax_return_note: [] };
    if (!invoiceCents && !debitNotePaidCents) return { row, files };

    // Settlement (R5): transfer to outstanding documents / deposit, or refund.
    if (!["transfer", "refund"].includes(data.settlement))
      fail("settlement must be transfer or refund: there is money to return");
    row.settlement = data.settlement;
    if (data.settlement === "transfer") {
      row.transfer_targets = await this._validateTargets(
        invoice,
        data.transfer_targets,
        { invoice: invoiceCents, debit_note: debitNotePaidCents },
        t1,
        exceptCancellationId,
      );
      return { row, files };
    }
    for (const field of ["refund_bank_name", "refund_account_name", "refund_account_number"]) {
      const value = data[field]?.toString().trim();
      if (!value) fail(`${field} is required for a refund`);
      row[field] = value;
    }
    if (!isNonEmptyArray(data.refund_letter)) fail("refund_letter must be a non-empty array for a refund");
    files.refund_letter = data.refund_letter;
    if (invoice.tax_invoice_status === "issued") {
      if (typeof data.tax_invoice_credited !== "boolean")
        fail("tax_invoice_credited must be a boolean: the tax invoice has been issued");
      row.tax_invoice_credited = data.tax_invoice_credited;
      if (data.tax_invoice_credited) {
        if (!isNonEmptyArray(data.tax_return_note))
          fail("tax_return_note must be a non-empty array: the client credited the tax invoice");
        files.tax_return_note = data.tax_return_note;
      }
    }
    return { row, files };
  }

  // Transfer targets (R5): invoice money only to invoices, debit note money only
  // to debit notes; each one outstanding for the same customer; a debit note paid
  // in full. What is not allocated becomes a deposit.
  async _validateTargets(invoice, targets, available, t1, exceptCancellationId) {
    if (targets === undefined || targets === null) return [];
    if (!Array.isArray(targets)) fail("transfer_targets must be an array");
    const outstanding = await this.outstandingTargets(invoice, t1, exceptCancellationId);
    const lists = { invoice: outstanding.invoices, debit_note: outstanding.debit_notes };
    const used = { invoice: 0, debit_note: 0 };
    const seen = new Set();
    const result = targets.map((target, index) => {
      const label = `transfer_targets[${index}]`;
      if (!TARGET_TYPES.includes(target?.type)) fail(`${label}.type must be invoice or debit_note`);
      const id = Number(target.id);
      if (!Number.isInteger(id) || id <= 0) fail(`${label}.id must be a positive integer`);
      const amount = Number(target.amount);
      if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6)
        fail(`${label}.amount must be more than 0 with at most 2 decimals`);
      const key = `${target.type}:${id}`;
      if (seen.has(key)) fail(`${label} is listed twice`);
      seen.add(key);
      const document = lists[target.type].find((row) => row.id === id);
      if (!document)
        fail(`${label} is not an outstanding ${target.type.replace("_", " ")} of the same customer, company and currency`);
      const amountCents = Math.round(amount * 100);
      if (amountCents > cents(document.remaining))
        fail(`${label}.amount cannot be more than its remaining ${document.remaining}`);
      if (target.type === "debit_note" && amountCents !== cents(document.remaining))
        fail(`${label}.amount must pay the debit note in full (${document.remaining})`);
      used[target.type] += amountCents;
      return { type: target.type, id, amount: fromCents(amountCents) };
    });
    if (used.invoice > available.invoice)
      fail(`Transfers to invoices cannot be more than the invoice money (${fromCents(available.invoice)})`);
    if (used.debit_note > available.debit_note)
      fail(`Transfers to debit notes cannot be more than the debit note money (${fromCents(available.debit_note)})`);
    return result;
  }

  async _syncRequestFiles(idCancellation, files, idUser, t1, t2) {
    for (const [category, list] of Object.entries(files))
      await syncFiles("invoice_paid_cancellations", idCancellation, category, list, idUser, t1, t2);
  }

  _summary(row) {
    const money = Number(row.invoice_amount) + Number(row.debit_note_amount);
    const debitNote = row.id_debit_note
      ? row.cancel_debit_note ? "; debit note cancelled too" : "; debit note continues"
      : "";
    const settlement = row.settlement === "none" ? "no money to return" : `${row.settlement} of ${money}`;
    return `${settlement}${debitNote}: ${row.reason}`;
  }

  /** Sales requests the cancellation of a paid invoice (R1–R5); the invoice is locked. */
  async request(id, data, idUser, isDoubleDatabase = true) {
    const created = await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const invoice = await invoiceService._lockInvoice(id, t1);
      const { problems, ...figures } = await this.evaluate(invoice, t1);
      if (problems.length) fail(problems[0][1], problems[0][0]);
      const { row, files } = await this._validate(invoice, data, figures, t1);
      const cancellation = await mirrorCreate(
        "InvoicePaidCancellation",
        {
          ...row,
          id_invoice: invoice.id,
          invoice_no: invoice.invoice_no,
          id_company: invoice.id_company,
          id_customer: invoice.id_customer,
          currency_type: invoice.currency_type,
          previous_status: invoice.status,
          tax_invoice_status: invoice.tax_invoice_status,
          status: "waiting ar&ap review",
          id_user_request: idUser,
          is_active: true,
        },
        t1,
        t2,
      );
      await this._syncRequestFiles(cancellation.id, files, idUser, t1, t2);
      await mirrorUpdate("Invoice", invoice.id, { status: LOCK_STATUS }, t1, t2);
      await invoiceService._addProgress(
        invoice.id,
        idUser,
        "paid cancellation requested",
        `Cancellation requested, ${this._summary(row)}`,
        t1,
        t2,
      );
      return cancellation;
    });
    return this.getById(created.id, idUser);
  }

  // Locks a request and its invoice; the request must be in one of statuses.
  async _lock(id, statuses, action, t1) {
    const cancellation = await models.db1.InvoicePaidCancellation.findOne({
      where: { id, is_active: true },
      transaction: t1,
      lock: t1.LOCK.UPDATE,
    });
    if (!cancellation) fail("Paid invoice cancellation not found", 404);
    if (!statuses.includes(cancellation.status))
      fail(`${action} is not allowed while the cancellation is ${cancellation.status}`, 409);
    const invoice = await invoiceService._lockInvoice(cancellation.id_invoice, t1);
    if (invoice.status !== LOCK_STATUS)
      fail(`The invoice is ${invoice.status}, not locked by this cancellation`, 409);
    return { cancellation: plain(cancellation), invoice };
  }

  /** Sales fixes a request AR & AP rejected and sends it again (full body, as a new request). */
  async resubmit(id, data, idUser, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const { cancellation, invoice } = await this._lock(id, ["rejected"], "Resubmitting", t1);
      const { problems, ...figures } = await this.evaluate(invoice, t1, cancellation.previous_status);
      if (problems.length) fail(problems[0][1], problems[0][0]);
      const { row, files } = await this._validate(invoice, data, figures, t1, cancellation.id);
      await mirrorUpdate(
        "InvoicePaidCancellation",
        cancellation.id,
        { ...row, status: "waiting ar&ap review", note: null },
        t1,
        t2,
      );
      await this._syncRequestFiles(cancellation.id, files, idUser, t1, t2);
      await invoiceService._addProgress(
        invoice.id,
        idUser,
        "paid cancellation resubmitted",
        `Cancellation resubmitted, ${this._summary(row)}`,
        t1,
        t2,
      );
    });
    return this.getById(id, idUser);
  }

  /** Sales withdraws a rejected request; the invoice goes back to its status before. */
  async withdraw(id, note, idUser, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const { cancellation, invoice } = await this._lock(id, ["rejected"], "Withdrawing", t1);
      await mirrorUpdate("InvoicePaidCancellation", cancellation.id, { status: "withdrawn" }, t1, t2);
      await mirrorUpdate("Invoice", invoice.id, { status: cancellation.previous_status }, t1, t2);
      await invoiceService._addProgress(
        invoice.id,
        idUser,
        "paid cancellation withdrawn",
        note?.toString().trim() || "Cancellation withdrawn by sales",
        t1,
        t2,
      );
    });
    return this.getById(id, idUser);
  }

  /**
   * Approves the request at its current step (R6): AR & AP, SPV FAT Internal, the
   * vice director, then the director. The director's approval sends it to the
   * transfer or the refund, or completes it when there is no money to return.
   */
  async approve(id, note, idUser, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const { cancellation, invoice } = await this._lock(id, APPROVAL_STATUSES, "Approving", t1);
      const step = steps[cancellation.status];
      const next = step.next || afterDirector[cancellation.settlement];
      await mirrorUpdate(
        "InvoicePaidCancellation",
        cancellation.id,
        { ...step.row(idUser), status: next, note: null },
        t1,
        t2,
      );
      await invoiceService._addProgress(
        invoice.id,
        idUser,
        "paid cancellation approved",
        [`Cancellation approved by ${step.role}`, note?.toString().trim()].filter(Boolean).join(": "),
        t1,
        t2,
      );
      if (next === "completed")
        await this.complete({ ...cancellation, status: next }, invoice, idUser, "No money to return", t1, t2);
    });
    return this.getById(id, idUser);
  }

  /**
   * Rejects the request at its current step (R6, P7): AR & AP sends it back to
   * sales; SPV FAT Internal, the vice director and the director send it back one
   * step. A note is required; files are optional.
   */
  async reject(id, note, files, idUser, isDoubleDatabase = true) {
    const text = note?.toString().trim();
    if (!text) fail("note is required for rejection");
    if (files !== undefined && !Array.isArray(files)) fail("reject_attachment must be an array");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const { cancellation, invoice } = await this._lock(id, APPROVAL_STATUSES, "Rejecting", t1);
      const step = steps[cancellation.status];
      await mirrorUpdate("InvoicePaidCancellation", cancellation.id, { status: step.reject, note: text }, t1, t2);
      const progress = await invoiceService._addProgress(
        invoice.id,
        idUser,
        "paid cancellation rejected",
        `Rejected by ${step.role}, back to ${step.reject === "rejected" ? "sales" : step.reject}: ${text}`,
        t1,
        t2,
      );
      if (files?.length)
        await syncFiles(
          "invoice_verification_progress",
          progress.id,
          "paid_cancellation_reject_attachment",
          files,
          idUser,
          t1,
          t2,
        );
    });
    return this.getById(id, idUser);
  }

  /**
   * AR & AP holds the request until the client's other outstanding invoices or
   * debit notes are paid (3.2); AR & AP approves or rejects it afterwards.
   */
  async hold(id, note, idUser, isDoubleDatabase = true) {
    const text = note?.toString().trim();
    if (!text) fail("note is required to tell sales what must be paid first");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const { cancellation, invoice } = await this._lock(id, ["waiting ar&ap review"], "Holding", t1);
      await mirrorUpdate(
        "InvoicePaidCancellation",
        cancellation.id,
        { status: "waiting outstanding settlement", note: text },
        t1,
        t2,
      );
      await invoiceService._addProgress(
        invoice.id,
        idUser,
        "paid cancellation held",
        `Waiting for outstanding settlement: ${text}`,
        t1,
        t2,
      );
    });
    return this.getById(id, idUser);
  }

  /**
   * Ends a request (R7): the invoice is cancelled with its tax invoice, and so is
   * the debit note when sales chose so. Used by the director's approval without
   * money to return, and later by the transfer and the refund.
   */
  async complete(cancellation, invoice, idUser, note, t1, t2) {
    const taxInvoiceStatus = {
      issued: "cancelled",
      requested: "none",
    }[invoice.tax_invoice_status];
    await mirrorUpdate(
      "Invoice",
      invoice.id,
      { status: "cancelled", ...(taxInvoiceStatus && { tax_invoice_status: taxInvoiceStatus }) },
      t1,
      t2,
    );
    if (cancellation.cancel_debit_note && cancellation.id_debit_note) {
      const debitNote = await models.db1.DebitNote.findOne({
        where: { id: cancellation.id_debit_note },
        transaction: t1,
        lock: t1.LOCK.UPDATE,
      });
      if (debitNote && debitNote.status !== "cancelled") {
        await mirrorUpdate("DebitNote", debitNote.id, { status: "cancelled" }, t1, t2);
        await mirrorCreate(
          "DebitNoteVerificationProgress",
          {
            id_debit_note: debitNote.id,
            id_user: idUser,
            status: "cancelled",
            note: `Cancelled with invoice ${invoice.invoice_no}`,
          },
          t1,
          t2,
        );
      }
    }
    await mirrorUpdate(
      "InvoicePaidCancellation",
      cancellation.id,
      { status: "completed", completed_at: new Date() },
      t1,
      t2,
    );
    await invoiceService._addProgress(
      invoice.id,
      idUser,
      "paid cancellation completed",
      [
        `Invoice cancelled (${note})`,
        taxInvoiceStatus === "cancelled" && `tax invoice ${invoice.tax_invoice_no || ""} cancelled`.trim(),
        cancellation.cancel_debit_note && cancellation.id_debit_note && "debit note cancelled",
      ]
        .filter(Boolean)
        .join("; "),
      t1,
      t2,
    );
  }

  /**
   * AR & AP carries out an approved payment transfer (7A.1–7A.5, R8): opens a
   * credit note per cancelled document with money (invoice, debit note), pays the
   * chosen outstanding invoices (an accepted payment, as if AR & AP accepted a
   * proof) and debit notes (paid in full), keeps the rest as the credit note's
   * deposit balance, and cancels the invoice. AR & AP may change sales' choice of
   * targets, since they may have been paid meanwhile.
   * @param {Object} data - { transfer_proof (files), allocations: [{ type, id, amount, payment_proof (files) }], transfer_date, note }
   */
  async processTransfer(id, data, idUser, isDoubleDatabase = true) {
    if (!isNonEmptyArray(data.transfer_proof)) fail("transfer_proof must be a non-empty array");
    if (!Array.isArray(data.allocations))
      fail("allocations must be an array; an empty one keeps all the money as a deposit");
    data.allocations.forEach((allocation, index) => {
      if (!isNonEmptyArray(allocation?.payment_proof))
        fail(`allocations[${index}].payment_proof must be a non-empty array`);
    });
    const transferDate = data.transfer_date ? new Date(data.transfer_date) : new Date();
    if (Number.isNaN(transferDate.getTime())) fail("transfer_date must be a valid date");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const { cancellation, invoice } = await this._lock(
        id,
        ["waiting for payment transfer"],
        "Processing the payment transfer",
        t1,
      );
      const available = {
        invoice: cents(cancellation.invoice_amount),
        debit_note: cents(cancellation.debit_note_amount),
      };
      const targets = await this._validateTargets(invoice, data.allocations, available, t1, cancellation.id);
      const now = new Date();
      const creditNotes = {};
      for (const source of CREDIT_NOTE_SOURCES) {
        if (!available[source]) continue;
        const allocated = targets
          .filter((target) => target.type === source)
          .reduce((sum, target) => sum + cents(target.amount), 0);
        creditNotes[source] = plain(
          await mirrorCreate(
            "CreditNote",
            {
              credit_note_no: await creditNoteService.nextNo(invoice.id_company, now, t1),
              id_company: invoice.id_company,
              id_customer: invoice.id_customer,
              currency_type: invoice.currency_type,
              source_type: source,
              id_invoice: invoice.id,
              id_debit_note: source === "debit_note" ? cancellation.id_debit_note : null,
              id_invoice_paid_cancellation: cancellation.id,
              date: now,
              amount: fromCents(available[source]),
              balance: fromCents(available[source] - allocated),
              note: data.note?.toString().trim() || null,
              id_user_create: idUser,
              is_active: true,
            },
            t1,
            t2,
          ),
        );
      }
      for (const [index, target] of targets.entries()) {
        const creditNote = creditNotes[target.type];
        const use = {
          creditNote,
          amount: target.amount,
          date: transferDate,
          note: `Paid from credit note ${creditNote.credit_note_no} (cancelled invoice ${invoice.invoice_no})`,
          proof: data.allocations[index].payment_proof,
          type: "transfer",
        };
        if (target.type === "invoice")
          await creditNoteService.payInvoice({ ...use, idInvoice: target.id }, idUser, t1, t2);
        else await creditNoteService.payDebitNote({ ...use, idDebitNote: target.id }, idUser, t1, t2);
      }
      await syncFiles("invoice_paid_cancellations", cancellation.id, "transfer_proof", data.transfer_proof, idUser, t1, t2);
      const summary = Object.values(creditNotes)
        .map((note) => `${note.credit_note_no} ${Number(note.amount)} (deposit ${Number(note.balance)})`)
        .join(", ");
      await this.complete(cancellation, invoice, idUser, `payment transferred, credit note ${summary}`, t1, t2);
    });
    return this.getById(id, idUser);
  }

  /**
   * AR & AP makes the refund payment request of an approved refund (7B.1, R9): the
   * money to return (invoice + debit note) to the client's account, straight to
   * the cashier ("approve cashier"), since the director already approved the
   * cancellation. The bank details default to sales' and may be corrected.
   * @param {Object} data - { refund_bank_name, refund_account_name, refund_account_number, priority, note }
   */
  async createRefund(id, data, idUser, isDoubleDatabase = true) {
    if (data.priority !== undefined && !["normal", "urgent"].includes(data.priority))
      fail("priority must be normal or urgent");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const { cancellation, invoice } = await this._lock(
        id,
        ["waiting for refund process"],
        "Creating the refund payment request",
        t1,
      );
      const bank = {};
      for (const field of ["refund_bank_name", "refund_account_name", "refund_account_number"]) {
        const value = (data[field] ?? cancellation[field])?.toString().trim();
        if (!value) fail(`${field} is required for the refund`);
        bank[field] = value;
      }
      const user = await models.db1.User.findByPk(idUser, { attributes: ["id", "id_department"], transaction: t1 });
      const amount = fromCents(cents(cancellation.invoice_amount) + cents(cancellation.debit_note_amount));
      const now = new Date();
      const debitNote = cancellation.id_debit_note && cancellation.cancel_debit_note && Number(cancellation.debit_note_amount)
        ? await models.db1.DebitNote.findByPk(cancellation.id_debit_note, { attributes: ["debit_note_no"], transaction: t1 })
        : null;
      const documents = [invoice.invoice_no, debitNote?.debit_note_no].filter(Boolean).join(" and ");
      const request = await mirrorCreate(
        "PaymentRequest",
        {
          id_company: invoice.id_company,
          id_customer: invoice.id_customer,
          id_user_request: idUser,
          id_department_request: user?.id_department ?? null,
          payment_request_no: await this._nextPaymentRequestNo(invoice.id_company, now, t1),
          request_format: "standard",
          payment_type: "refund",
          payment_purpose: `Refund of cancelled ${documents}`,
          invoice_no: invoice.invoice_no,
          payment_date: now,
          total_payment_request: amount,
          sub_total_payment: amount,
          bank_name: bank.refund_bank_name,
          account_name: bank.refund_account_name,
          account_number: bank.refund_account_number,
          description: [
            `Refund of cancelled ${documents}: invoice ${Number(cancellation.invoice_amount)}`,
            Number(cancellation.debit_note_amount) && `debit note ${Number(cancellation.debit_note_amount)}`,
            data.note?.toString().trim(),
          ].filter(Boolean).join("; "),
          priority: data.priority || "normal",
          status: "approve cashier",
          id_invoice_paid_cancellation: cancellation.id,
          is_active: true,
        },
        t1,
        t2,
      );
      await mirrorCreate(
        "PaymentRequestVerificationProgress",
        {
          id_payment_request: request.id,
          id_user: idUser,
          status: "requested",
          note: `Refund of cancelled invoice ${invoice.invoice_no}, approved up to the director in the cancellation; waiting for the cashier's payment`,
        },
        t1,
        t2,
      );
      await mirrorUpdate(
        "InvoicePaidCancellation",
        cancellation.id,
        { ...bank, status: "waiting for cashier payment", id_payment_request: request.id, note: null },
        t1,
        t2,
      );
      await invoiceService._addProgress(
        invoice.id,
        idUser,
        "paid cancellation refund requested",
        `Refund payment request ${request.payment_request_no} of ${amount} created, waiting for the cashier's payment`,
        t1,
        t2,
      );
    });
    return this.getById(id, idUser);
  }

  // PRQ-{initial company}-{year}-{00001}, like GET /payment-requests/no/documents.
  async _nextPaymentRequestNo(idCompany, now, t1) {
    const year = now.getFullYear();
    const total = await models.db1.PaymentRequest.count({
      where: {
        id_company: idCompany,
        is_active: true,
        createdAt: { [Op.gte]: new Date(year, 0, 1), [Op.lt]: new Date(year + 1, 0, 1) },
      },
      transaction: t1,
    });
    const company = await models.db1.Company.findByPk(idCompany, { attributes: ["initial_company"], transaction: t1 });
    const initial = company?.initial_company?.toUpperCase() || "-";
    return `PRQ-${initial}-${year}-${String(total + 1).padStart(5, "0")}`;
  }

  /**
   * Called by the payment request service inside its transaction when a refund
   * payment request changes status (7B.3–7B.6). paid: the cashier paid the client
   * and the cancellation completes; a rejection: back to AR & AP to make it again.
   */
  async onRefundPaymentRequest(idPaymentRequest, status, note, idUser, t1, t2) {
    const cancellation = await models.db1.InvoicePaidCancellation.findOne({
      where: { id_payment_request: idPaymentRequest, is_active: true },
      transaction: t1,
      lock: t1.LOCK.UPDATE,
    });
    if (!cancellation || cancellation.status !== "waiting for cashier payment")
      fail("This refund payment request no longer waits for the cashier", 409);
    const invoice = await invoiceService._lockInvoice(cancellation.id_invoice, t1);
    const request = await models.db1.PaymentRequest.findByPk(idPaymentRequest, {
      attributes: ["id", "payment_request_no"],
      transaction: t1,
    });
    if (status === "paid") {
      await this.complete(plain(cancellation), invoice, idUser, `refunded through payment request ${request.payment_request_no}`, t1, t2);
      return;
    }
    if (!String(status).startsWith("reject"))
      fail("A refund payment request only waits for the cashier's payment", 409);
    const text = note?.toString().trim() || "no note";
    await mirrorUpdate(
      "InvoicePaidCancellation",
      cancellation.id,
      { status: "waiting for refund process", id_payment_request: null, note: text },
      t1,
      t2,
    );
    await invoiceService._addProgress(
      invoice.id,
      idUser,
      "paid cancellation rejected",
      `Refund payment request ${request.payment_request_no} rejected by the cashier, back to AR & AP: ${text}`,
      t1,
      t2,
    );
  }

  _includes(db) {
    return [
      {
        model: db.Invoice,
        as: "invoice",
        attributes: [
          "id", "invoice_no", "status", "date", "due_date", "total", "payment_amount",
          "tax_invoice_status", "tax_invoice_no", "id_contract", "id_pre_order", "id_debit_note",
        ],
      },
      { model: db.Customer, as: "customer", attributes: ["id", "company_name_indo", "company_name_mandarin"] },
      { model: db.Company, as: "company", attributes: ["id", "company_name", "initial_company"] },
      {
        model: db.DebitNote,
        as: "debit_note",
        attributes: ["id", "debit_note_no", "status", "total", "payment_amount"],
      },
      ...["user_request", "user_review", "user_verify", "user_vice_approve", "user_approve"].map((as) => ({
        model: db.User,
        as,
        attributes: userAttributes,
      })),
      {
        model: db.PaymentRequest,
        as: "payment_request",
        attributes: ["id", "payment_request_no", "status", "total_payment_request", "total_payment", "file_proof_payment"],
      },
    ];
  }

  /** One request with its files, history and My Task flags. */
  async getById(id, userId = null) {
    const db = models.db1;
    const row = await db.InvoicePaidCancellation.findOne({
      where: { id, is_active: true },
      include: [
        ...this._includes(db),
        ...["cancellation_attachment", "refund_letter", "tax_return_note", "transfer_proof"].map((as) => ({
          model: db.File,
          as,
          required: false,
          where: { is_active: true },
        })),
        {
          model: db.PaymentRequest,
          as: "refund_payment_requests",
          separate: true,
          order: [["id", "ASC"]],
          attributes: ["id", "payment_request_no", "status", "total_payment_request", "total_payment", "file_proof_payment"],
        },
        {
          model: db.CreditNote,
          as: "credit_notes",
          separate: true,
          order: [["id", "ASC"]],
          include: [
            {
              model: db.CreditNoteAllocation,
              as: "allocations",
              separate: true,
              order: [["id", "ASC"]],
              include: [
                { model: db.Invoice, as: "invoice", attributes: ["id", "invoice_no", "status"] },
                { model: db.DebitNote, as: "debit_note", attributes: ["id", "debit_note_no", "status"] },
                { model: db.File, as: "payment_proof", required: false, where: { is_active: true } },
              ],
            },
          ],
        },
      ],
    });
    if (!row) fail("Paid invoice cancellation not found", 404);
    const data = plain(row);
    // History of this request: the invoice's paid cancellation entries since it was made.
    const createdAt = { [Op.gte]: data.createdAt };
    if (["completed", "withdrawn"].includes(data.status)) createdAt[Op.lte] = data.updatedAt;
    data.progress = (
      await db.InvoiceVerificationProgress.findAll({
        where: { id_invoice: data.id_invoice, status: { [Op.like]: "paid cancellation%" }, createdAt },
        include: [
          { model: db.User, as: "user", attributes: userAttributes },
          { model: db.File, as: "paid_cancellation_reject_attachment", required: false, where: { is_active: true } },
        ],
        order: [["id", "ASC"]],
      })
    ).map(plain);
    return userId ? approvalAccess.attachActionFlags(APPROVAL_FOR, data, userId) : data;
  }

  /** Requests, newest first, with My Task flags. Filters: status, id_invoice, id_customer, id_company, search. */
  async list(query = {}, userId = null) {
    const db = models.db1;
    const where = { is_active: true };
    if (query.status) where.status = String(query.status).split(",");
    for (const key of ["id_invoice", "id_customer", "id_company"]) if (query[key]) where[key] = query[key];
    if (query.search) where.invoice_no = { [Op.like]: `%${query.search}%` };
    const options = { where, include: this._includes(db), order: [["id", "DESC"]] };
    const page = parseInt(query.page, 10);
    const limit = parseInt(query.limit, 10);
    let result;
    if (page > 0 && limit > 0) {
      const { count, rows } = await db.InvoicePaidCancellation.findAndCountAll({
        ...options,
        limit,
        offset: (page - 1) * limit,
        distinct: true,
      });
      result = {
        data: rows.map(plain),
        pagination: { total: count, total_page: Math.ceil(count / limit), current_page: page, per_page: limit },
      };
    } else {
      result = (await db.InvoicePaidCancellation.findAll(options)).map(plain);
    }
    return userId ? approvalAccess.attachActionFlags(APPROVAL_FOR, result, userId) : result;
  }
}

module.exports = new InvoicePaidCancellationService();
module.exports.APPROVAL_FOR = APPROVAL_FOR;
module.exports.APPROVAL_STATUSES = APPROVAL_STATUSES;
module.exports.ELIGIBLE_STATUSES = ELIGIBLE_STATUSES;
module.exports.LOCK_STATUS = LOCK_STATUS;
