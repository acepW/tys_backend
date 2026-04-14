const { where } = require("sequelize");
const vendorService = require("../services/vendor.service");
const { successResponse, errorResponse } = require("../utils/response");

class VendorController {
  /**
   * Get all vendors
   */
  async getAll(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      const vendors = await vendorService.findAll(
        { where: { is_active: true } },
        isDoubleDatabase,
      );

      return successResponse(res, vendors, "Vendors retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get division by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      const vendor = await vendorService.findById(id, {}, isDoubleDatabase);

      if (!vendor) {
        return errorResponse(res, "Vendor not found", 404);
      }

      return successResponse(res, vendor, "Vendor retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create new vendor
   */
  async create(req, res) {
    try {
      const { is_double_database = true, vendor_name } = req.body;
      const isDoubleDatabase = is_double_database;

      // Validation
      if (!vendor_name) {
        return errorResponse(res, "Vendor name is required", 400);
      }

      // Check if vendor already exists
      if (vendor_name) {
        const vendorExists = await vendorService.checkVendorExists(
          vendor_name,
          null,
          isDoubleDatabase,
        );

        if (vendorExists) {
          return errorResponse(res, "Vendor already exists", 400);
        }
      }

      const data = {
        vendor_name: vendor_name,
        is_active: req.body.is_active !== undefined ? req.body.is_active : true,
      };

      const vendor = await vendorService.create(data, isDoubleDatabase);

      return successResponse(res, vendor, "Vendor created successfully", 201);
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update vendor
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true, vendor_name } = req.body || {};
      const isDoubleDatabase = is_double_database;

      // Check if vendor exists
      const existing = await vendorService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Vendor not found", 404);
      }

      // Check if vendor name already exists
      if (vendor_name) {
        const vendorExists = await vendorService.checkVendorExists(
          vendor_name,
          id,
          isDoubleDatabase,
        );

        if (vendorExists) {
          return errorResponse(res, "Vendor already exists", 400);
        }
      }

      const data = {};
      if (vendor_name) data.vendor_name = vendor_name;

      const vendor = await vendorService.update(id, data, isDoubleDatabase);

      return successResponse(res, vendor, "Vendor updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete customer
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      // Check if vendor exists
      const existing = await vendorService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Vendor not found", 404);
      }

      await vendorService.update(id, { is_active: false }, isDoubleDatabase);

      return successResponse(res, null, "Vendor deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new VendorController();
