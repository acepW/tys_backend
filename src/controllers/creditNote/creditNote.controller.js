const creditNoteService = require("../../services/creditNote/creditNote.service");
const { successResponse, errorResponse } = require("../../utils/response");

// Credit notes of cancelled paid invoices and the use of their deposit balance
// (docs/invoice-cancellation-paid.md, fase E).
const fromError = (res, error) => errorResponse(res, error.message, error.statusCode || 500);
const isDouble = (req) => String(req.body?.is_double_database ?? req.query?.is_double_database) !== "false";
const pickUse = (body = {}) => ({
  id_credit_note: body.id_credit_note,
  amount: body.amount,
  payment_date: body.payment_date,
  payment_proof: body.payment_proof,
  note: body.note,
});

class CreditNoteController {
  /** GET /credit-notes/deposits?target_type=invoice|debit_note&id_target= */
  async deposits(req, res) {
    try {
      const data = await creditNoteService.deposits(req.query.target_type, req.query.id_target);
      return successResponse(res, data, "Credit note deposits retrieved successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /** GET /credit-notes/:id */
  async getById(req, res) {
    try {
      const data = await creditNoteService.getById(req.params.id);
      return successResponse(res, data, "Credit note retrieved successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /** PATCH /invoices/credit-note-payment/:id (AR & AP) */
  async payInvoice(req, res) {
    try {
      const data = await creditNoteService.useDeposit("invoice", req.params.id, pickUse(req.body), req.user.id, isDouble(req));
      return successResponse(res, data, "Invoice paid from the credit note deposit successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /** PATCH /debit-notes/credit-note-payment/:id */
  async payDebitNote(req, res) {
    try {
      const data = await creditNoteService.useDeposit("debit_note", req.params.id, pickUse(req.body), req.user.id, isDouble(req));
      return successResponse(res, data, "Debit note paid from the credit note deposit successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }
}

module.exports = new CreditNoteController();
