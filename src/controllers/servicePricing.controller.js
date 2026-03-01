const servicePricingService = require("../services/servicePricing/servicePricing.service");
const { successResponse, errorResponse } = require("../utils/response");
const { Op } = require("sequelize");

class ServicePricingController {
  /**
   * Get all service pricing
   */
  async getAll(req, res) {
    try {
      const {
        is_double_database = true,
        id_category,
        status,
        search,
        page,
        limit,
      } = req.query;
      const isDoubleDatabase = is_double_database;

      let obj = {};
      if (search) {
        obj = {
          [Op.or]: [
            { product_name_indo: { [Op.like]: `%${search}%` } },
            { product_name_mandarin: { [Op.like]: `%${search}%` } },
          ],
        };
      }
      if (id_category) obj.id_category = id_category;
      if (status) obj.status = status;

      const servicePricing = await servicePricingService.getAllWithRelations(
        { where: obj },
        parseInt(page),
        parseInt(limit),
        isDoubleDatabase,
      );

      return successResponse(
        res,
        servicePricing,
        "Service pricing retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get service pricing by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const servicePricing = await servicePricingService.getById(
        id,
        {},
        isDoubleDatabase,
      );

      if (!servicePricing) {
        return errorResponse(res, "Service pricing not found", 404);
      }

      return successResponse(
        res,
        servicePricing,
        "Service pricing retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create multiple service pricing with variants
   */
  async create(req, res) {
    try {
      const { is_double_database, service_pricing_list } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Validation
      if (!service_pricing_list || !Array.isArray(service_pricing_list)) {
        return errorResponse(res, "service_pricing_list must be an array", 400);
      }

      if (service_pricing_list.length === 0) {
        return errorResponse(res, "service_pricing_list cannot be empty", 400);
      }

      // Validate each service pricing item
      for (let i = 0; i < service_pricing_list.length; i++) {
        const item = service_pricing_list[i];

        if (!item.product_name_indo) {
          return errorResponse(
            res,
            `product_name_indo is required for item at index ${i}`,
            400,
          );
        }

        if (!item.product_name_mandarin) {
          return errorResponse(
            res,
            `product_name_mandarin is required for item at index ${i}`,
            400,
          );
        }

        // Ensure variants is an array
        if (item.variants && !Array.isArray(item.variants)) {
          return errorResponse(
            res,
            `variants must be an array for item at index ${i}`,
            400,
          );
        }
      }

      // Prepare data with is_active default
      const servicePricingDataList = service_pricing_list.map((item) => ({
        ...item,
        id_user_create: req.user.id,
        is_active: item.is_active !== undefined ? item.is_active : true,
      }));

      const result = await servicePricingService.createMultipleWithVariants(
        servicePricingDataList,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        result,
        "Service pricing created successfully",
        201,
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update service pricing with variants
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, variants, ...servicePricingData } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if service pricing exists
      const existing = await servicePricingService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Service pricing not found", 404);
      }

      // Validate variants is an array if provided
      if (variants && !Array.isArray(variants)) {
        return errorResponse(res, "variants must be an array", 400);
      }

      const result = await servicePricingService.updateWithVariants(
        id,
        servicePricingData,
        variants || [],
        isDoubleDatabase,
      );

      return successResponse(
        res,
        result,
        "Service pricing updated successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * approve service pricing
   */
  async approve(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true } = req.body || {};
      const isDoubleDatabase = is_double_database;

      // Check if service pricing exists
      const existing = await servicePricingService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Service pricing not found", 404);
      }
      const result = await servicePricingService.update(
        id,
        { status: "approved", id_user_approve: req.user.id },
        isDoubleDatabase,
      );

      return successResponse(
        res,
        result,
        "Service pricing approved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * reject service pricing
   */
  async reject(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true } = req.body || {};
      const isDoubleDatabase = is_double_database;

      // Check if service pricing exists
      const existing = await servicePricingService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Service pricing not found", 404);
      }

      const result = await servicePricingService.update(
        id,
        { status: "rejected", id_user_reject: req.user.id },
        isDoubleDatabase,
      );

      return successResponse(
        res,
        result,
        "Service pricing rejected successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete service pricing
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      // Check if service pricing exists
      const existing = await servicePricingService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Service pricing not found", 404);
      }

      await servicePricingService.delete(id, isDoubleDatabase);

      return successResponse(res, null, "Service pricing deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new ServicePricingController();
