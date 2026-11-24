const paidCancellationService = require("../../services/invoice/invoicePaidCancellation.service");
const { successResponse, errorResponse } = require("../../utils/response");

// Cancellation of a paid invoice (or one with a tax invoice), see
// docs/invoice-cancellation-paid.md.
const fromError = (res, error) => errorResponse(res, error.message, error.statusCode || 500);
const isDouble = (req) => String(req.body?.is_double_database ?? req.query?.is_double_database) !== "false";

// Request body fields sales sends (R5).
const REQUEST_FIELDS = [
  "service_condition",
  "reason",
  "cancellation_attachment",
  "confirm_tax_invoice_cancel",
  "cancel_debit_note",
  "invoice_amount",
  "settlement",
  "transfer_targets",
  "refund_bank_name",
  "refund_account_name",
  "refund_account_number",
  "refund_letter",
  "tax_invoice_credited",
  "tax_return_note",
];
const pickRequest = (body = {}) =>
  Object.fromEntries(REQUEST_FIELDS.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));

class InvoicePaidCancellationController {
  /** GET /invoices/:id/paid-cancellation/preview */
  async preview(req, res) {
    try {
      const data = await paidCancellationService.preview(req.params.id);
      return successResponse(res, data, "Paid invoice cancellation preview retrieved successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /** PATCH /invoices/paid-cancellation-request/:id (sales) */
  async request(req, res) {
    try {
      const data = await paidCancellationService.request(
        req.params.id,
        pickRequest(req.body),
        req.user.id,
        isDouble(req),
      );
      return successResponse(res, data, "Paid invoice cancellation requested successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /** GET /invoice-paid-cancellations */
  async list(req, res) {
    try {
      const data = await paidCancellationService.list(req.query, req.user.id);
      return successResponse(res, data, "Paid invoice cancellations retrieved successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /** GET /invoice-paid-cancellations/:id */
  async getById(req, res) {
    try {
      const data = await paidCancellationService.getById(req.params.id, req.user.id);
      return successResponse(res, data, "Paid invoice cancellation retrieved successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /** PUT /invoice-paid-cancellations/resubmit/:id (sales, from rejected) */
  async resubmit(req, res) {
    try {
      const data = await paidCancellationService.resubmit(
        req.params.id,
        pickRequest(req.body),
        req.user.id,
        isDouble(req),
      );
      return successResponse(res, data, "Paid invoice cancellation resubmitted successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /** PATCH /invoice-paid-cancellations/withdraw/:id (sales, from rejected) */
  async withdraw(req, res) {
    try {
      const data = await paidCancellationService.withdraw(req.params.id, req.body?.note, req.user.id, isDouble(req));
      return successResponse(res, data, "Paid invoice cancellation withdrawn successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /** PATCH /invoice-paid-cancellations/approve/:id */
  async approve(req, res) {
    try {
      const data = await paidCancellationService.approve(req.params.id, req.body?.note, req.user.id, isDouble(req));
      return successResponse(res, data, "Paid invoice cancellation approved successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /** PATCH /invoice-paid-cancellations/reject/:id */
  async reject(req, res) {
    try {
      const data = await paidCancellationService.reject(
        req.params.id,
        req.body?.note,
        req.body?.reject_attachment,
        req.user.id,
        isDouble(req),
      );
      return successResponse(res, data, "Paid invoice cancellation rejected successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /** PATCH /invoice-paid-cancellations/process-transfer/:id (AR & AP, 7A) */
  async processTransfer(req, res) {
    try {
      const { transfer_proof, allocations, transfer_date, note } = req.body || {};
      const data = await paidCancellationService.processTransfer(
        req.params.id,
        { transfer_proof, allocations, transfer_date, note },
        req.user.id,
        isDouble(req),
      );
      return successResponse(res, data, "Payment transfer processed successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /** PATCH /invoice-paid-cancellations/create-refund/:id (AR & AP, 7B) */
  async createRefund(req, res) {
    try {
      const { refund_bank_name, refund_account_name, refund_account_number, priority, note } = req.body || {};
      const data = await paidCancellationService.createRefund(
        req.params.id,
        { refund_bank_name, refund_account_name, refund_account_number, priority, note },
        req.user.id,
        isDouble(req),
      );
      return successResponse(res, data, "Refund payment request created successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /** PATCH /invoice-paid-cancellations/hold/:id (AR & AP) */
  async hold(req, res) {
    try {
      const data = await paidCancellationService.hold(req.params.id, req.body?.note, req.user.id, isDouble(req));
      return successResponse(res, data, "Paid invoice cancellation held for outstanding settlement");
    } catch (error) {
      return fromError(res, error);
    }
  }
}

module.exports = new InvoicePaidCancellationController();
