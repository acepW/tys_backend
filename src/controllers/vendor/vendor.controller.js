const vendorService = require("../../services/vendor/vendor.service");
const { successResponse, errorResponse } = require("../../utils/response");
const { Op } = require("sequelize");

class VendorController {
  /**
   * Get all vendors
   */
  async getAll(req, res) {
    try {
      const {
        is_double_database = true,
        is_request = false,
        status,
        search,
        page,
        limit,
      } = req.query || {};
      const isDoubleDatabase = is_double_database;

      let obj = {};
      if (search) {
        obj = {
          [Op.or]: [{ vendor_name: { [Op.like]: `%${search}%` } }],
        };
      }
      if (status) obj.status = status;
      if (is_request === "false" || is_request === false) obj.is_active = true;

      const vendors = await vendorService.getAllWithRelations(
        { where: obj },
        parseInt(page),
        parseInt(limit),
        isDoubleDatabase
      );

      return successResponse(res, vendors, "Vendors retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get vendor by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const vendor = await vendorService.getById(id, {}, isDoubleDatabase);

      if (!vendor) {
        return errorResponse(res, "Vendor not found", 404);
      }

      return successResponse(res, vendor, "Vendor retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create vendor
   * Status awal: pending, is_active: false
   */
  async create(req, res) {
    try {
      const {
        is_double_database,
        vendor_services = [],
        ...vendorData
      } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      if (!vendorData.vendor_name) {
        return errorResponse(res, "vendor_name is required", 400);
      }

      const result = await vendorService.createWithRelations(
        {
          ...vendorData,
          id_user_request: req.user.id,
          id_department_request: req.user.id_department,
        },
        vendor_services,
        req.user.id,
        isDoubleDatabase
      );

      return successResponse(res, result, "Vendor created successfully", 201);
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update vendor with vendor services
   * vendor_services: [] — kosong = hapus semua, isi id = update, tanpa id = tambah baru
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        is_double_database,
        vendor_services = [],
        ...vendorData
      } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      const existing = await vendorService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Vendor not found", 404);
      }

      const result = await vendorService.updateWithRelations(
        id,
        vendorData,
        vendor_services,
        isDoubleDatabase
      );

      return successResponse(res, result, "Vendor updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Approve vendor
   * Sets status = "approve" and is_active = true
   */
  async approve(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true, note } = req.body || {};
      const isDoubleDatabase = is_double_database;

      const existing = await vendorService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Vendor not found", 404);
      }

      if (existing.status === "approve") {
        return errorResponse(res, "Vendor is already approved", 400);
      }

      const result = await vendorService.approveVendor(
        id,
        note,
        req.user.id,
        isDoubleDatabase
      );

      return successResponse(res, result, "Vendor approved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Reject vendor
   * Note wajib diisi
   * Sets status = "reject", is_active remains false
   */
  async reject(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true, note } = req.body || {};
      const isDoubleDatabase = is_double_database;

      const existing = await vendorService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Vendor not found", 404);
      }

      if (!note) {
        return errorResponse(res, "Rejection note is required", 400);
      }

      if (existing.status === "reject") {
        return errorResponse(res, "Vendor is already rejected", 400);
      }

      const result = await vendorService.rejectVendor(
        id,
        note,
        req.user.id,
        isDoubleDatabase
      );

      return successResponse(res, result, "Vendor rejected successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete vendor
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const existing = await vendorService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Vendor not found", 404);
      }

      await vendorService.delete(id, isDoubleDatabase);

      return successResponse(res, null, "Vendor deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new VendorController();
