const debitNoteService = require("../../services/debitNote/debitNote.service");
const { successResponse, errorResponse } = require("../../utils/response");
const { Op } = require("sequelize");

class DebitNoteController {
  /**
   * Get all debit notes
   */
  async getAll(req, res) {
    try {
      const {
        is_double_database,
        id_company,
        id_customer,
        id_contract,
        id_quotation,
        id_invoice,
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
            { debit_note_no: { [Op.like]: `%${search}%` } },
            { note: { [Op.like]: `%${search}%` } },
          ],
        };
      }
      if (id_company) obj.id_company = id_company;
      if (id_customer) obj.id_customer = id_customer;
      if (id_contract) obj.id_contract = id_contract;
      if (id_quotation) obj.id_quotation = id_quotation;
      if (id_invoice) obj.id_invoice = id_invoice;
      if (status) obj.status = status;

      const debitNotes = await debitNoteService.getAllWithRelations(
        { where: obj },
        parseInt(page),
        parseInt(limit),
        isDoubleDatabase,
      );

      return successResponse(
        res,
        debitNotes,
        "Debit notes retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get debit note by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const debitNote = await debitNoteService.getById(
        id,
        {},
        isDoubleDatabase,
      );

      if (!debitNote) {
        return errorResponse(res, "Debit note not found", 404);
      }

      return successResponse(
        res,
        debitNote,
        "Debit note retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create debit note with debit note items
   */
  async create(req, res) {
    try {
      const { is_double_database, debit_note_items, ...debitNoteData } =
        req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Validation
      if (!debitNoteData.id_quotation) {
        return errorResponse(res, "id_quotation is required", 400);
      }
      if (!debitNoteData.id_contract) {
        return errorResponse(res, "id_contract is required", 400);
      }
      if (!debitNoteData.id_company) {
        return errorResponse(res, "id_company is required", 400);
      }
      if (!debitNoteData.id_customer) {
        return errorResponse(res, "id_customer is required", 400);
      }
      if (!debitNoteData.debit_note_no) {
        return errorResponse(res, "debit_note_no is required", 400);
      }
      if (!debitNoteData.date) {
        return errorResponse(res, "date is required", 400);
      }

      // Validate debit_note_items
      if (debit_note_items && !Array.isArray(debit_note_items)) {
        return errorResponse(res, "debit_note_items must be an array", 400);
      }

      // Validate each item if provided
      if (debit_note_items && debit_note_items.length > 0) {
        for (let i = 0; i < debit_note_items.length; i++) {
          const item = debit_note_items[i];
          if (!item.product_name_indo) {
            return errorResponse(
              res,
              `debit_note_items[${i}].product_name_indo is required`,
              400,
            );
          }
          if (!item.product_name_mandarin) {
            return errorResponse(
              res,
              `debit_note_items[${i}].product_name_mandarin is required`,
              400,
            );
          }
          if (item.price_idr === undefined || item.price_idr === null) {
            return errorResponse(
              res,
              `debit_note_items[${i}].price_idr is required`,
              400,
            );
          }
          if (item.price_rmb === undefined || item.price_rmb === null) {
            return errorResponse(
              res,
              `debit_note_items[${i}].price_rmb is required`,
              400,
            );
          }
          if (item.qty === undefined || item.qty === null) {
            return errorResponse(
              res,
              `debit_note_items[${i}].qty is required`,
              400,
            );
          }
          if (
            item.total_price_idr === undefined ||
            item.total_price_idr === null
          ) {
            return errorResponse(
              res,
              `debit_note_items[${i}].total_price_idr is required`,
              400,
            );
          }
          if (
            item.total_price_rmb === undefined ||
            item.total_price_rmb === null
          ) {
            return errorResponse(
              res,
              `debit_note_items[${i}].total_price_rmb is required`,
              400,
            );
          }
        }
      }

      // Set default values
      const debitNoteDataToCreate = {
        ...debitNoteData,
        id_user_create: req.user.id,
        status: "pending",
        is_active:
          debitNoteData.is_active !== undefined
            ? debitNoteData.is_active
            : true,
        sub_total: debitNoteData.sub_total || 0,
        ppn: debitNoteData.ppn || 0,
        pph: debitNoteData.pph || 0,
        total: debitNoteData.total || 0,
        tax_ppn: debitNoteData.tax_ppn || false,
        tax_pph_23: debitNoteData.tax_pph_23 || false,
        note: debitNoteData.note || "",
      };

      const result = await debitNoteService.createWithRelations(
        debitNoteDataToCreate,
        debit_note_items || [],
        req.user.id,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        result,
        "Debit note created successfully",
        201,
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update debit note with debit note items (create/update/delete)
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, debit_note_items, ...debitNoteData } =
        req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if debit note exists
      const existing = await debitNoteService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Debit note not found", 404);
      }

      // Validate debit_note_items
      if (debit_note_items && !Array.isArray(debit_note_items)) {
        return errorResponse(res, "debit_note_items must be an array", 400);
      }

      const result = await debitNoteService.updateWithRelations(
        id,
        debitNoteData,
        debit_note_items || [],
        isDoubleDatabase,
      );

      return successResponse(res, result, "Debit note updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Submit debit note
   */
  async submit(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true, note } = req.body || {};
      const isDoubleDatabase = is_double_database;

      const existing = await debitNoteService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Debit note not found", 404);
      }

      const result = await debitNoteService.submitDebitNote(
        id,
        note,
        req.user.id,
        isDoubleDatabase,
      );

      return successResponse(res, result, "Debit note submitted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Approve debit note
   */
  async approve(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true, note } = req.body || {};
      const isDoubleDatabase = is_double_database;

      const existing = await debitNoteService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Debit note not found", 404);
      }

      const result = await debitNoteService.approveDebitNote(
        id,
        note,
        req.user.id,
        isDoubleDatabase,
      );

      return successResponse(res, result, "Debit note approved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Reject debit note
   */
  async reject(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true, note } = req.body || {};
      const isDoubleDatabase = is_double_database;

      const existing = await debitNoteService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Debit note not found", 404);
      }

      const result = await debitNoteService.rejectDebitNote(
        id,
        note,
        req.user.id,
        isDoubleDatabase,
      );

      return successResponse(res, result, "Debit note rejected successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete debit note
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const existing = await debitNoteService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Debit note not found", 404);
      }

      await debitNoteService.delete(id, isDoubleDatabase);

      return successResponse(res, null, "Debit note deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new DebitNoteController();
