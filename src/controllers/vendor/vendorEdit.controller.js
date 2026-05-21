const vendorEditService = require("../../services/vendor/vendorEdit.service");
const { successResponse, errorResponse } = require("../../utils/response");
const { Op } = require("sequelize");

class VendorEditController {
  /**
   * Get all vendor edits
   */
  async getAll(req, res) {
    try {
      const {
        is_double_database = true,
        id_vendor,
        status,
        search,
        page,
        limit,
      } = req.query || {};

      const isDoubleDatabase = is_double_database !== "false";

      let where = {};
      if (search) {
        where[Op.or] = [{ vendor_name: { [Op.like]: `%${search}%` } }];
      }
      if (status) where.status = status;
      if (id_vendor) where.id_vendor = id_vendor;

      const result = await vendorEditService.getAllWithRelations(
        { where },
        parseInt(page) || null,
        parseInt(limit) || null,
        isDoubleDatabase
      );

      return successResponse(
        res,
        result,
        "Vendor edits retrieved successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get vendor edit by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true } = req.query || {};
      const isDoubleDatabase = is_double_database;

      const vendorEdit = await vendorEditService.getById(
        id,
        {},
        isDoubleDatabase
      );

      if (!vendorEdit) {
        return errorResponse(res, "Vendor edit not found", 404);
      }

      return successResponse(
        res,
        vendorEdit,
        "Vendor edit retrieved successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create vendor edit
   * - VendorEdit status  : pending
   * - Vendor status      : request edit
   * - Progress           : request edit
   *
   * Body:
   * {
   *   id_vendor,
   *   vendor_name, pic_name, npwp, nib, email, phone_number,
   *   type_of_service, bank_name, account_number, account_holder_name,
   *   bank_branch, transaction_currency, file,
   *   vendor_service_edits: [
   *     { id_vendor_service, id_category, service_name, price_idr, price_rmb }
   *   ]
   * }
   */
  async create(req, res) {
    try {
      const {
        is_double_database = true,
        vendor_service_edits = [],
        ...vendorEditData
      } = req.body || {};

      const isDoubleDatabase = is_double_database;

      if (!vendorEditData.id_vendor) {
        return errorResponse(res, "id_vendor is required", 400);
      }
      if (!vendorEditData.vendor_name) {
        return errorResponse(res, "vendor_name is required", 400);
      }

      const result = await vendorEditService.createWithRelations(
        {
          ...vendorEditData,
          id_user_request: req.user.id,
          id_department_request: req.user.id_department,
        },
        vendor_service_edits,
        req.user.id,
        isDoubleDatabase
      );

      return successResponse(
        res,
        result,
        "Vendor edit created successfully",
        201
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Approve vendor edit
   * - VendorEdit status  : approve
   * - Vendor status      : approve edit
   * - Progress           : approve edit
   * - Replace semua data vendor dengan data di vendor edit
   * - Sync vendor_services berdasarkan vendor_services_edit
   *
   * Body: { note, is_double_database }
   */
  async approve(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true, note } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;

      const existing = await vendorEditService.findById(
        id,
        {},
        isDoubleDatabase
      );
      if (!existing) {
        return errorResponse(res, "Vendor edit not found", 404);
      }

      const result = await vendorEditService.approveVendorEdit(
        id,
        note,
        req.user.id,
        isDoubleDatabase
      );

      return successResponse(res, result, "Vendor edit approved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Reject vendor edit
   * - VendorEdit status  : reject
   * - Vendor status      : reject edit
   * - Progress           : reject edit
   *
   * Body: { note (required), is_double_database }
   */
  async reject(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true, note } = req.body || {};
      const isDoubleDatabase = is_double_database;

      const existing = await vendorEditService.findById(
        id,
        {},
        isDoubleDatabase
      );
      if (!existing) {
        return errorResponse(res, "Vendor edit not found", 404);
      }

      const result = await vendorEditService.rejectVendorEdit(
        id,
        note,
        req.user.id,
        isDoubleDatabase
      );

      return successResponse(res, result, "Vendor edit rejected successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete vendor edit (opsional, hanya saat masih pending)
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const existing = await vendorEditService.findById(
        id,
        {},
        isDoubleDatabase
      );
      if (!existing) {
        return errorResponse(res, "Vendor edit not found", 404);
      }

      if (existing.status !== "pending") {
        return errorResponse(
          res,
          "Only pending vendor edits can be deleted",
          400
        );
      }

      await vendorEditService.delete(id, isDoubleDatabase);

      return successResponse(res, null, "Vendor edit deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new VendorEditController();
