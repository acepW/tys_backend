const invoiceService = require("../services/invoice/invoice.service");
const { successResponse, errorResponse } = require("../utils/response");
const { Op } = require("sequelize");

class InvoiceController {
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
        id_quotation,
        status,
        search,
        page,
        limit,
      } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      let obj = {};
      if (search) {
        obj = {
          [Op.or]: [
            { invoice_no: { [Op.like]: `%${search}%` } },
            { note: { [Op.like]: `%${search}%` } },
          ],
        };
      }
      if (id_company) obj.id_company = id_company;
      if (id_customer) obj.id_customer = id_customer;
      if (id_contract) obj.id_contract = id_contract;
      if (id_quotation) obj.id_quotation = id_quotation;
      if (status) obj.status = status;

      const invoices = await invoiceService.getAllWithRelations(
        { where: obj },
        parseInt(page),
        parseInt(limit),
        isDoubleDatabase,
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
        isDoubleDatabase,
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
        isDoubleDatabase,
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
        isDoubleDatabase,
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
        isDoubleDatabase,
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
        isDoubleDatabase,
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
        isDoubleDatabase,
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
        file_invoice,
      );

      return successResponse(
        res,
        result,
        "Invoice waiting for payment successfully",
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
      const { is_double_database = true, note } = req.body || {};
      const isDoubleDatabase = is_double_database;

      const existing = await invoiceService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Invoice not found", 404);
      }

      const result = await invoiceService.payInvoice(
        id,
        note,
        req.user.id,
        isDoubleDatabase,
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

      await invoiceService.delete(id, isDoubleDatabase);

      return successResponse(res, null, "Invoice deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new InvoiceController();
