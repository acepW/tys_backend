const reportCreditNoteService = require("../../services/report/reportCreditNote.service");
const { successResponse, errorResponse } = require("../../utils/response");

// Credit note reports (docs/invoice-cancellation-paid.md R13).
const fromError = (res, error) => errorResponse(res, error.message, error.statusCode || 500);

class ReportCreditNoteController {
  /** GET /report-credit-notes/balances */
  async balances(req, res) {
    try {
      const data = await reportCreditNoteService.balances(req.query);
      return successResponse(res, data, "Credit note balances retrieved successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /** GET /report-credit-notes */
  async list(req, res) {
    try {
      const data = await reportCreditNoteService.list(req.query);
      return successResponse(res, data, "Credit notes retrieved successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /** GET /report-credit-notes/ledger */
  async ledger(req, res) {
    try {
      const data = await reportCreditNoteService.ledger(req.query);
      return successResponse(res, data, "Credit note ledger retrieved successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /** GET /report-credit-notes/:id */
  async detail(req, res) {
    try {
      const data = await reportCreditNoteService.detail(req.params.id);
      return successResponse(res, data, "Credit note retrieved successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }
}

module.exports = new ReportCreditNoteController();
