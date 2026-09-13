const invoiceService = require("../../services/invoice/invoice.service");
const incomingInvoiceService = require("../../services/invoice/incomingInvoice.service");
const { successResponse, errorResponse } = require("../../utils/response");

class InvoiceController {
  /**
   * Get incoming or history invoice sources from Contract and PreOrder.
   */
  async getIncoming(req, res) {
    try {
      const {
        status = "incoming",
        source_type = "all",
        search,
        page = 1,
        limit = 10,
      } = req.query || {};
      const result = await incomingInvoiceService.getAll({
        status,
        sourceType: source_type,
        search,
        page,
        limit,
      });

      return successResponse(
        res,
        result,
        `${status === "history" ? "History" : "Incoming"} invoices retrieved successfully`,
      );
    } catch (error) {
      const statusCode = error.message.includes("must be") ? 400 : 500;
      return errorResponse(res, error.message, statusCode);
    }
  }
  /**
   * Get all invoices
   */
  async getAll(req, res) {
    try {
      const {
        is_double_database,
        id_company,
        id_customer,
        id_contract,
        id_pre_order,
        id_quotation,
        source_type,
        status,
        search,
        page,
        limit,
      } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const obj = {};

      if (id_company) obj.id_company = id_company;
      if (id_customer) obj.id_customer = id_customer;
      if (id_contract) obj.id_contract = id_contract;
      if (id_pre_order) obj.id_pre_order = id_pre_order;
      if (id_quotation) obj.id_quotation = id_quotation;
      if (source_type) obj.source_type = source_type;
      if (status) obj.status = status;
      obj.is_active = true;

      const invoices = await invoiceService.getAllWithRelations(
        { where: obj },
        parseInt(page),
        parseInt(limit),
        isDoubleDatabase,
        search,
      );

      return successResponse(res, invoices, "Invoices retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get invoice by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const invoice = await invoiceService.getById(id, {}, isDoubleDatabase);

      if (!invoice) {
        return errorResponse(res, "Invoice not found", 404);
      }

      return successResponse(res, invoice, "Invoice retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get no Invoice
   */
  async getNoInvoice(req, res) {
    try {
      const { is_double_database = true } = req.query || {};
      const isDoubleDatabase = is_double_database;

      const invoice = await invoiceService.getNoInvoice(isDoubleDatabase);

      if (!invoice) {
        return errorResponse(res, "Invoice not found", 404);
      }

      return successResponse(res, invoice, "Invoice retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create invoice from incoming Contract/PreOrder payment lists.
   */
  async createFromIncoming(req, res) {
    try {
      const {
        is_double_database,
        incoming_invoice_ids,
        incoming_debit_note_ids = [],
        debit_note_data = null,
        ...invoiceData
      } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;

      if (
        !Array.isArray(incoming_invoice_ids) ||
        incoming_invoice_ids.length === 0
      ) {
        return errorResponse(
          res,
          "incoming_invoice_ids must be a non-empty array",
          400,
        );
      }
      if (
        incoming_invoice_ids.some(
          (id) => !Number.isInteger(Number(id)) || Number(id) <= 0,
        )
      ) {
        return errorResponse(
          res,
          "incoming_invoice_ids must contain valid IDs",
          400,
        );
      }
      if (!Array.isArray(incoming_debit_note_ids)) {
        return errorResponse(
          res,
          "incoming_debit_note_ids must be an array",
          400,
        );
      }
      if (
        incoming_debit_note_ids.some(
          (id) => !Number.isInteger(Number(id)) || Number(id) <= 0,
        )
      ) {
        return errorResponse(
          res,
          "incoming_debit_note_ids must contain valid IDs",
          400,
        );
      }
      if (
        incoming_debit_note_ids.length > 0 &&
        (!debit_note_data || !debit_note_data.debit_note_no)
      ) {
        return errorResponse(
          res,
          "debit_note_data.debit_note_no is required",
          400,
        );
      }
      if (!invoiceData.invoice_no) {
        return errorResponse(res, "invoice_no is required", 400);
      }
      if (!invoiceData.date) {
        return errorResponse(res, "date is required", 400);
      }

      const result = await invoiceService.createFromIncoming(
        invoiceData,
        incoming_invoice_ids,
        req.user.id,
        isDoubleDatabase,
        incoming_debit_note_ids,
        debit_note_data,
      );

      return successResponse(
        res,
        result,
        "Invoice created from incoming payment successfully",
        201,
      );
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Create invoice with invoice services
   */
  async create(req, res) {
    try {
      const { is_double_database, invoice_services, ...invoiceData } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Validation
      if (!invoiceData.id_quotation) {
        return errorResponse(res, "id_quotation is required", 400);
      }
      if (!invoiceData.id_contract) {
        return errorResponse(res, "id_contract is required", 400);
      }
      if (!invoiceData.id_contract_payment) {
        return errorResponse(res, "id_contract_payment is required", 400);
      }
      if (!invoiceData.id_company) {
        return errorResponse(res, "id_company is required", 400);
      }
      if (!invoiceData.id_customer) {
        return errorResponse(res, "id_customer is required", 400);
      }

      if (!invoiceData.invoice_no) {
        return errorResponse(res, "invoice_no is required", 400);
      }
      if (!invoiceData.date) {
        return errorResponse(res, "date is required", 400);
      }

      // Validate invoice_services
      if (invoice_services && !Array.isArray(invoice_services)) {
        return errorResponse(res, "invoice_services must be an array", 400);
      }

      // Set default values
      const invoiceDataToCreate = {
        ...invoiceData,
        source_type: "contract",
        id_pre_order: null,
        id_pre_order_payment: null,
        id_user_create: req.user.id,
        status: "pending",
        is_active:
          invoiceData.is_active !== undefined ? invoiceData.is_active : true,
        sub_total: invoiceData.sub_total || 0,
        ppn: invoiceData.ppn || 0,
        pph: invoiceData.pph || 0,
        total: invoiceData.total || 0,
        note: invoiceData.note || "",
      };

      const result = await invoiceService.createWithRelations(
        invoiceDataToCreate,
        invoice_services || [],
        req.user.id,
        isDoubleDatabase
      );

      return successResponse(res, result, "Invoice created successfully", 201);
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update invoice with invoice services (create/update/delete)
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, invoice_services, ...invoiceData } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if invoice exists
      const existing = await invoiceService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Invoice not found", 404);
      }

      // Validate invoice_services
      if (invoice_services && !Array.isArray(invoice_services)) {
        return errorResponse(res, "invoice_services must be an array", 400);
      }

      const result = await invoiceService.updateWithRelations(
        id,
        invoiceData,
        invoice_services || [],
        isDoubleDatabase
      );

      return successResponse(res, result, "Invoice updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Submit invoice
   */
  async submit(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true, note } = req.body || {};
      const isDoubleDatabase = is_double_database;

      const existing = await invoiceService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Invoice not found", 404);
      }

      const result = await invoiceService.submitInvoice(
        id,
        note,
        req.user.id,
        isDoubleDatabase
      );

      return successResponse(res, result, "Invoice submitted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Approve invoice
   */
  async approve(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true, note } = req.body || {};
      const isDoubleDatabase = is_double_database;

      const existing = await invoiceService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Invoice not found", 404);
      }

      const result = await invoiceService.approveInvoice(
        id,
        note,
        req.user.id,
        isDoubleDatabase
      );

      return successResponse(res, result, "Invoice approved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Reject invoice
   */
  async reject(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true, note } = req.body || {};
      const isDoubleDatabase = is_double_database;

      const existing = await invoiceService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Invoice not found", 404);
      }

      const result = await invoiceService.rejectInvoice(
        id,
        note,
        req.user.id,
        isDoubleDatabase
      );

      return successResponse(res, result, "Invoice rejected successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * signing invoice
   */
  async signing(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true, note } = req.body || {};
      const isDoubleDatabase = is_double_database;

      const existing = await invoiceService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Invoice not found", 404);
      }

      const result = await invoiceService.signingPaymentInvoice(
        id,
        note,
        req.user.id,
        isDoubleDatabase
      );

      return successResponse(res, result, "Invoice signing successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * waitingForPayment invoice
   */
  async waitingForPayment(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true, note, file_invoice } = req.body || {};
      const isDoubleDatabase = is_double_database;

      const existing = await invoiceService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Invoice not found", 404);
      }

      const result = await invoiceService.waitingPaymentInvoice(
        id,
        note,
        req.user.id,
        isDoubleDatabase,
        file_invoice
      );

      return successResponse(
        res,
        result,
        "Invoice waiting for payment successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Pay invoice
   */
  async pay(req, res) {
    try {
      const { id } = req.params;
      const {
        is_double_database = true,
        note,
        payment_date,
        payment_amount,
        payment_method,
        proof_of_payment,
        payment_for,
      } = req.body || {};
      const isDoubleDatabase = is_double_database;

      const existing = await invoiceService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Invoice not found", 404);
      }

      const result = await invoiceService.payInvoice(
        id,
        note,
        payment_date,
        payment_amount,
        payment_method,
        proof_of_payment,
        payment_for,
        req.user.id,
        isDoubleDatabase
      );

      return successResponse(res, result, "Invoice paid successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete invoice
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const existing = await invoiceService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Invoice not found", 404);
      }

      await invoiceService.update(id, { is_active: false }, isDoubleDatabase);

      return successResponse(res, null, "Invoice deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new InvoiceController();
