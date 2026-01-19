const subCategoryService = require("../services/subCategory.service");
const { successResponse, errorResponse } = require("../utils/response");

class SubCategoryController {
  // Get all sub-categories
  async getAll(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      const subCategories =
        await subCategoryService.getAllWithCategory(isDoubleDatabase);

      return successResponse(
        res,
        subCategories,
        "Sub-categories retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get sub-category by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      const subCategory = await subCategoryService.findById(
        id,
        {},
        isDoubleDatabase,
      );

      if (!subCategory) {
        return errorResponse(res, "Sub-category not found", 404);
      }

      return successResponse(
        res,
        subCategory,
        "Sub-category retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get sub-categories by category ID
   */
  async getByCategoryId(req, res) {
    try {
      const { categoryId } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      const subCategories = await subCategoryService.getByCategoryId(
        categoryId,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        subCategories,
        "Sub-categories retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create new sub-category
   */
  async create(req, res) {
    try {
      const isDoubleDatabase = req.body.is_double_database !== false;

      // Validation
      if (!req.body.id_category) {
        return errorResponse(res, "Category ID is required", 400);
      }

      if (!req.body.sub_category_name) {
        return errorResponse(res, "Sub-category name is required", 400);
      }

      // Check if sub-category name exists in this category
      const exists = await subCategoryService.checkSubCategoryExists(
        req.body.id_category,
        req.body.sub_category_name,
        null,
        isDoubleDatabase,
      );

      if (exists) {
        return errorResponse(
          res,
          "Sub-category name already exists in this category",
          400,
        );
      }

      const data = {
        id_category: req.body.id_category,
        sub_category_name: req.body.sub_category_name,
        is_active: req.body.is_active !== undefined ? req.body.is_active : true,
      };

      const subCategory = await subCategoryService.createWithValidation(
        data,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        subCategory,
        "Sub-category created successfully",
        201,
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update sub-category
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.body.is_double_database !== false;

      // Check if sub-category exists
      const existing = await subCategoryService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Sub-category not found", 404);
      }

      const data = {};

      if (req.body.id_category) {
        data.id_category = req.body.id_category;
      }

      if (req.body.sub_category_name) {
        // Check if new name already exists
        const categoryId = req.body.id_category || existing.id_category;
        const nameExists = await subCategoryService.checkSubCategoryExists(
          categoryId,
          req.body.sub_category_name,
          id,
          isDoubleDatabase,
        );

        if (nameExists) {
          return errorResponse(
            res,
            "Sub-category name already exists in this category",
            400,
          );
        }

        data.sub_category_name = req.body.sub_category_name;
      }

      if (req.body.is_active !== undefined) {
        data.is_active = req.body.is_active;
      }

      const subCategory = await subCategoryService.update(
        id,
        data,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        subCategory,
        "Sub-category updated successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete sub-category
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      // Check if sub-category exists
      const existing = await subCategoryService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Sub-category not found", 404);
      }

      await subCategoryService.delete(id, isDoubleDatabase);

      return successResponse(res, null, "Sub-category deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new SubCategoryController();
