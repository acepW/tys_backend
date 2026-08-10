const governmentCostService = require("../../services/masterGovernmentCost/governmentCost.service");
const categoryService = require("../../services/category.service");
const { successResponse, errorResponse } = require("../../utils/response");

class GovernmentCostController {
  /**
   * Get all government costs
   */
  async getAll(req, res) {
    try {
      const { is_double_database = true, page, limit } = req.query || {};
      const isDoubleDatabase = is_double_database !== "false";

      const governmentCosts = await governmentCostService.getAllWithRelations(
        {},
        page,
        limit,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        governmentCosts,
        "Government costs retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get government cost by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const governmentCost = await governmentCostService.getById(
        id,
        isDoubleDatabase,
      );

      if (!governmentCost) {
        return errorResponse(res, "Government cost not found", 404);
      }

      return successResponse(
        res,
        governmentCost,
        "Government cost retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get government costs by category
   */
  async getByCategory(req, res) {
    try {
      const { categoryId } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const governmentCosts = await governmentCostService.getByCategory(
        categoryId,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        governmentCosts,
        "Government costs retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create new government cost
   */
  async create(req, res) {
    try {
      const {
        is_double_database = true,
        id_category,
        government_cost_fields,
      } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Validation
      if (!id_category) {
        return errorResponse(res, "Category is required", 400);
      }

      // check data category
      const checkDataCategory = await categoryService.findById(
        id_category,
        {},
        isDoubleDatabase,
      );
      if (!checkDataCategory) {
        return errorResponse(res, "Category not found", 400);
      }

      const data = {
        id_category: id_category,
        is_active: true,
      };

      const governmentCost = await governmentCostService.createWithFields(
        data,
        government_cost_fields,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        governmentCost,
        "Government cost created successfully",
        201,
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update government cost
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, id_category, government_cost_fields } =
        req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if government cost exists
      const existing = await governmentCostService.getById(
        id,
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Government cost not found", 404);
      }

      // check data category if provided
      if (id_category) {
        const checkDataCategory = await categoryService.findById(
          id_category,
          {},
          isDoubleDatabase,
        );
        if (!checkDataCategory) {
          return errorResponse(res, "Category not found", 400);
        }
      }

      const data = {
        id_category: id_category,
      };

      const governmentCost = await governmentCostService.updateWithFields(
        id,
        data,
        government_cost_fields,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        governmentCost,
        "Government cost updated successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete government cost (soft delete)
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      // Check if government cost exists
      const existing = await governmentCostService.getById(
        id,
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Government cost not found", 404);
      }

      await governmentCostService.update(
        id,
        { is_active: false },
        isDoubleDatabase,
      );

      return successResponse(res, null, "Government cost deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new GovernmentCostController();
