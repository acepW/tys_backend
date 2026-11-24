// Credit notes of cancelled paid invoices (docs/invoice-cancellation-paid.md R8,
// fase C and E). Paying an invoice or debit note from a credit note is shared by
// the payment transfer of a cancellation (7A, type "transfer") and by the later
// use of the deposit balance (fase E, type "deposit").
const { Op } = require("sequelize");
const { models } = require("../../models");
const invoiceService = require("../invoice/invoice.service");
const debitNoteService = require("../debitNote/debitNote.service");
const {
  fail,
  withTransactions,
  mirrorCreate,
  mirrorUpdate,
  syncFiles,
} = require("../procurement/shared");

const romanMonths = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
// Invoices a credit note may pay: still waiting for (the rest of) their payment.
const TARGET_INVOICE_STATUSES = ["waiting for payment", "payment proof rejected"];
const TARGET_TYPES = ["invoice", "debit_note"];
const KIND = { invoice: "an invoice", debit_note: "a debit note" };

const cents = (value) => Math.round(Number(value || 0) * 100);
const fromCents = (value) => value / 100;
const plain = (row) => (row?.toJSON ? row.toJSON() : row);

class CreditNoteService {
  // 001/CN/{initial company}/{roman month}/{year}, counted per company per year (P9).
  async nextNo(idCompany, now, t1) {
    const year = now.getFullYear();
    const total = await models.db1.CreditNote.count({
      where: {
        id_company: idCompany,
        createdAt: { [Op.gte]: new Date(`${year}-01-01`), [Op.lt]: new Date(`${year + 1}-01-01`) },
      },
      transaction: t1,
    });
    const company = await models.db1.Company.findByPk(idCompany, { attributes: ["initial_company"], transaction: t1 });
    const initial = company?.initial_company?.toUpperCase() || "-";
    return `${String(total + 1).padStart(3, "0")}/CN/${initial}/${romanMonths[now.getMonth()]}/${year}`;
  }

  /**
   * An accepted payment on an invoice waiting for payment, from a credit note: the
   * invoice moves on as if AR & AP accepted a payment proof (paid off, withholding
   * tax, final invoice request). Its total and taxes do not change.
   * @param {Object} use - { creditNote, idInvoice, amount, date, note, proof, type }
   */
  async payInvoice({ creditNote, idInvoice, amount, date, note, proof, type }, idUser, t1, t2) {
    const invoice = await invoiceService._lockInvoiceIn(
      idInvoice,
      TARGET_INVOICE_STATUSES,
      "Payment from a credit note",
      t1,
    );
    const remaining = cents(invoice.total) - cents(invoice.payment_amount);
    if (cents(amount) > remaining)
      fail(`The amount cannot be more than the invoice's remaining ${fromCents(remaining)}`);
    const payment = { amount, transfer_date: date, payment_method: "credit note" };
    await invoiceService._settleAcceptedPayment(invoice, payment, note, idUser, t1, t2);
    const row = await mirrorCreate(
      "InvoicePayment",
      {
        id_invoice: invoice.id,
        ...payment,
        bank_name: null,
        status: "accepted",
        note,
        verification_note: note,
        id_user_create: idUser,
        id_user_verify: idUser,
        verified_at: new Date(),
        id_credit_note: creditNote.id,
      },
      t1,
      t2,
    );
    await syncFiles("invoice_payments", row.id, "payment_proof", proof, idUser, t1, t2);
    await this._addAllocation(
      creditNote,
      { type, target_type: "invoice", id_invoice: invoice.id, id_invoice_payment: row.id, amount, date, note },
      proof,
      idUser,
      t1,
      t2,
    );
    return invoice;
  }

  /**
   * An approved debit note paid in full from a credit note (P6); its payment
   * request, if any, becomes paid too, as when a debit note is paid by hand.
   * @param {Object} use - { creditNote, idDebitNote, amount, date, note, proof, type }
   */
  async payDebitNote({ creditNote, idDebitNote, amount, date, note, proof, type }, idUser, t1, t2) {
    const debitNote = await models.db1.DebitNote.findOne({
      where: { id: idDebitNote, is_active: true },
      transaction: t1,
      lock: t1.LOCK.UPDATE,
    });
    if (!debitNote || debitNote.status !== "approved")
      fail(`Debit note ${idDebitNote} is not waiting for payment`, 409);
    if (cents(debitNote.total) !== cents(amount))
      fail(`Debit note ${debitNote.debit_note_no} must be paid in full (${Number(debitNote.total)})`);
    await debitNoteService.assertChangeable(debitNote.id, "paid");
    // debit_notes keeps one proof link; the files stay on the allocation.
    const proofUrl = proof?.[0]?.url || null;
    await mirrorUpdate(
      "DebitNote",
      debitNote.id,
      { status: "paid", payment_date: date, payment_amount: amount, proof_of_payment: proofUrl, id_user_paid: idUser },
      t1,
      t2,
    );
    await mirrorCreate(
      "DebitNoteVerificationProgress",
      { id_debit_note: debitNote.id, id_user: idUser, status: "paid", note },
      t1,
      t2,
    );
    if (debitNote.id_payment_request)
      await mirrorUpdate(
        "PaymentRequest",
        debitNote.id_payment_request,
        { total_payment: amount, file_proof_payment: proofUrl, status: "paid" },
        t1,
        t2,
      );
    await this._addAllocation(
      creditNote,
      { type, target_type: "debit_note", id_debit_note: debitNote.id, amount, date, note },
      proof,
      idUser,
      t1,
      t2,
    );
    return plain(debitNote);
  }

  async _addAllocation(creditNote, data, proof, idUser, t1, t2) {
    const allocation = await mirrorCreate(
      "CreditNoteAllocation",
      { id_credit_note: creditNote.id, ...data, id_user_create: idUser, is_active: true },
      t1,
      t2,
    );
    await syncFiles("credit_note_allocations", allocation.id, "payment_proof", proof, idUser, t1, t2);
  }

  // The invoice or debit note a deposit is used on, outstanding, with its remaining amount.
  async _target(targetType, idTarget, t1) {
    if (!TARGET_TYPES.includes(targetType)) fail("target_type must be invoice or debit_note");
    const id = Number(idTarget);
    if (!Number.isInteger(id) || id <= 0) fail("id_target must be a positive integer");
    if (targetType === "invoice") {
      const invoice = await models.db1.Invoice.findOne({ where: { id, is_active: true }, transaction: t1 });
      if (!invoice) fail("Invoice not found", 404);
      if (!TARGET_INVOICE_STATUSES.includes(invoice.status))
        fail(`A deposit cannot pay an invoice that is ${invoice.status}`, 409);
      return { row: plain(invoice), number: invoice.invoice_no, remaining: cents(invoice.total) - cents(invoice.payment_amount) };
    }
    const debitNote = await models.db1.DebitNote.findOne({ where: { id, is_active: true }, transaction: t1 });
    if (!debitNote) fail("Debit note not found", 404);
    if (debitNote.status !== "approved") fail(`A deposit cannot pay a debit note that is ${debitNote.status}`, 409);
    return { row: plain(debitNote), number: debitNote.debit_note_no, remaining: cents(debitNote.total) };
  }

  // Credit notes that may pay the target: deposit left, same customer, company and
  // currency (P15), and money of the same kind (P16).
  _depositWhere(targetType, target) {
    return {
      id_customer: target.id_customer,
      id_company: target.id_company,
      currency_type: target.currency_type,
      source_type: targetType,
      balance: { [Op.gt]: 0 },
      is_active: true,
    };
  }

  /** GET deposits an invoice or debit note may use, oldest first. */
  async deposits(targetType, idTarget) {
    const target = await this._target(targetType, idTarget);
    const creditNotes = await models.db1.CreditNote.findAll({
      where: this._depositWhere(targetType, target.row),
      attributes: ["id", "credit_note_no", "date", "amount", "balance", "source_type", "id_invoice", "id_debit_note"],
      include: [
        { model: models.db1.Invoice, as: "invoice", attributes: ["id", "invoice_no"] },
        { model: models.db1.DebitNote, as: "debit_note", attributes: ["id", "debit_note_no"] },
      ],
      order: [["date", "ASC"], ["id", "ASC"]],
    });
    return {
      target_type: targetType,
      id_target: target.row.id,
      number: target.number,
      remaining: fromCents(target.remaining),
      // A debit note is paid in full only (P6).
      must_pay_in_full: targetType === "debit_note",
      credit_notes: creditNotes.map(plain),
    };
  }

  /**
   * AR & AP pays an outstanding invoice or debit note from the deposit balance of a
   * credit note (fase E, P8): an accepted payment (invoice) or a full payment
   * (debit note), recorded as a deposit allocation; the balance goes down.
   * @param {Object} data - { id_credit_note, amount, payment_date, payment_proof, note }
   */
  async useDeposit(targetType, idTarget, data, idUser, isDoubleDatabase = true) {
    const idCreditNote = Number(data.id_credit_note);
    if (!Number.isInteger(idCreditNote) || idCreditNote <= 0) fail("id_credit_note must be a positive integer");
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6)
      fail("amount must be more than 0 with at most 2 decimals");
    if (data.payment_proof !== undefined && !Array.isArray(data.payment_proof))
      fail("payment_proof must be an array");
    const date = data.payment_date ? new Date(data.payment_date) : new Date();
    if (Number.isNaN(date.getTime())) fail("payment_date must be a valid date");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const target = await this._target(targetType, idTarget, t1);
      const creditNote = await models.db1.CreditNote.findOne({
        where: { id: idCreditNote, is_active: true },
        transaction: t1,
        lock: t1.LOCK.UPDATE,
      });
      if (!creditNote) fail("Credit note not found", 404);
      const where = this._depositWhere(targetType, target.row);
      if (creditNote.source_type !== targetType)
        fail(`A credit note from ${KIND[creditNote.source_type]} can only pay ${KIND[creditNote.source_type]}`);
      if (["id_customer", "id_company", "currency_type"].some((key) => creditNote[key] !== where[key]))
        fail("The credit note belongs to another customer, company or currency");
      const amountCents = Math.round(amount * 100);
      if (amountCents > cents(creditNote.balance))
        fail(`The amount cannot be more than the credit note's deposit ${Number(creditNote.balance)}`);
      const note = [
        `Paid from the deposit of credit note ${creditNote.credit_note_no}`,
        data.note?.toString().trim(),
      ].filter(Boolean).join(": ");
      const use = { creditNote: plain(creditNote), amount: fromCents(amountCents), date, note, proof: data.payment_proof, type: "deposit" };
      if (targetType === "invoice") await this.payInvoice({ ...use, idInvoice: target.row.id }, idUser, t1, t2);
      else await this.payDebitNote({ ...use, idDebitNote: target.row.id }, idUser, t1, t2);
      await mirrorUpdate(
        "CreditNote",
        creditNote.id,
        { balance: fromCents(cents(creditNote.balance) - amountCents) },
        t1,
        t2,
      );
    });
    return this.getById(idCreditNote);
  }

  /** One credit note with where it came from and every use. */
  async getById(id) {
    const db = models.db1;
    const row = await db.CreditNote.findOne({
      where: { id, is_active: true },
      include: [
        { model: db.Customer, as: "customer", attributes: ["id", "company_name_indo", "company_name_mandarin"] },
        { model: db.Company, as: "company", attributes: ["id", "company_name", "initial_company"] },
        { model: db.Invoice, as: "invoice", attributes: ["id", "invoice_no", "status", "total", "id_contract", "id_pre_order"] },
        { model: db.DebitNote, as: "debit_note", attributes: ["id", "debit_note_no", "status", "total"] },
        {
          model: db.InvoicePaidCancellation,
          as: "paid_cancellation",
          attributes: ["id", "status", "reason", "service_condition", "settlement", "invoice_kept", "approved_at"],
        },
        {
          model: db.CreditNoteAllocation,
          as: "allocations",
          separate: true,
          order: [["date", "ASC"], ["id", "ASC"]],
          include: [
            { model: db.Invoice, as: "invoice", attributes: ["id", "invoice_no", "status"] },
            { model: db.DebitNote, as: "debit_note", attributes: ["id", "debit_note_no", "status"] },
            { model: db.User, as: "user_create", attributes: ["id", "name", "email"] },
            { model: db.File, as: "payment_proof", required: false, where: { is_active: true } },
          ],
        },
      ],
    });
    if (!row) fail("Credit note not found", 404);
    return plain(row);
  }
}

module.exports = new CreditNoteService();
module.exports.TARGET_INVOICE_STATUSES = TARGET_INVOICE_STATUSES;
