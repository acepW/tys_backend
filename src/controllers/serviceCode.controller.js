const serviceCodeService = require("../services/serviceCode.service");
const { successResponse, errorResponse } = require("../utils/response");

class ServiceCodeController {
  /**
   * Get all service codes
   */
  async getAll(req, res) {
    try {
      const { is_double_database = true } = req.query || {};
      const isDoubleDatabase = is_double_database !== "false";
      const serviceCodes = await serviceCodeService.findAll(
        { where: { is_active: true } },
        isDoubleDatabase
      );

      return successResponse(
        res,
        serviceCodes,
        "Service codes retrieved successfully"
      );
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
      const { is_double_database = true } = req.query || {};
      const isDoubleDatabase = is_double_database !== "false";

      const serviceCode = await serviceCodeService.findById(
        id,
        {},
        isDoubleDatabase
      );

      if (!serviceCode) {
        return errorResponse(res, "Service code not found", 404);
      }

      return successResponse(
        res,
        serviceCode,
        "Service code retrieved successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create new service code
   */
  async create(req, res) {
    try {
      const {
        is_double_database = true,
        service_code,
        description,
      } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;

      // Validation
      if (!service_code) {
        return errorResponse(res, "Service code is required", 400);
      }

      if (!description) {
        return errorResponse(res, "Description is required", 400);
      }

      // Check if service code already exists
      if (service_code) {
        const serviceCodeExists =
          await serviceCodeService.checkServiceCodeExists(
            service_code,
            null,
            isDoubleDatabase
          );

        if (serviceCodeExists) {
          return errorResponse(res, "Service code already exists", 400);
        }
      }

      const data = {
        service_code: service_code,
        description: description,
        is_active: req.body.is_active !== undefined ? req.body.is_active : true,
      };

      const serviceCode = await serviceCodeService.create(
        data,
        isDoubleDatabase
      );

      return successResponse(
        res,
        serviceCode,
        "Service code created successfully",
        201
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update customer
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        is_double_database = true,
        service_code,
        description,
      } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;

      // Check if service code exists
      const existing = await serviceCodeService.findById(
        id,
        {},
        isDoubleDatabase
      );
      if (!existing) {
        return errorResponse(res, "Division not found", 404);
      }

      // Check if service code already exists
      if (service_code) {
        const serviceCodeExists =
          await serviceCodeService.checkServiceCodeExists(
            service_code,
            id,
            isDoubleDatabase
          );

        if (serviceCodeExists) {
          return errorResponse(res, "Service code already exists", 400);
        }
      }

      const data = {};
      if (service_code) data.service_code = service_code;
      if (description) data.description = description;

      const serviceCode = await serviceCodeService.update(
        id,
        data,
        isDoubleDatabase
      );

      return successResponse(
        res,
        serviceCode,
        "Service Code updated successfully"
      );
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
      const { is_double_database = true } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;

      // Check if division exists
      const existing = await serviceCodeService.findById(
        id,
        {},
        isDoubleDatabase
      );
      if (!existing) {
        return errorResponse(res, "Service code not found", 404);
      }

      await serviceCodeService.update(
        id,
        { is_active: false },
        isDoubleDatabase
      );

      return successResponse(res, null, "Service Code deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new ServiceCodeController();
