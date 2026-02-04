const categoryService = require("../services/category.service");
const { successResponse, errorResponse } = require("../utils/response");

class CategoryController {
  /**
   * Get all categories
   */
  async getAll(req, res) {
    try {
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";
      const categories = await categoryService.findAll({}, isDoubleDatabase);

      return successResponse(
        res,
        categories,
        "Categories retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get all categories with sub-categories
   */
  async getAllWithSub(req, res) {
    try {
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";
      const categories =
        await categoryService.getAllWithSubCategories(isDoubleDatabase);

      return successResponse(
        res,
        categories,
        "Categories with sub-categories retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get active categories only
   */
  async getActive(req, res) {
    try {
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";
      const categories =
        await categoryService.getActiveCategories(isDoubleDatabase);

      return successResponse(
        res,
        categories,
        "Active categories retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get category by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, with_sub } = req.query;
      const isDoubleDatabase = is_double_database !== "false";
      const withSub = with_sub === "true";

      let category;
      if (withSub) {
        category = await categoryService.getByIdWithSubCategories(
          id,
          isDoubleDatabase,
        );
      } else {
        category = await categoryService.findById(id, {}, isDoubleDatabase);
      }

      if (!category) {
        return errorResponse(res, "Category not found", 404);
      }

      return successResponse(res, category, "Category retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create new category
   */
  async create(req, res) {
    try {
      const {
        is_double_database,
        category_name_indo,
        category_name_mandarin,
        foot_note,
      } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Validation
      if (!category_name_indo) {
        return errorResponse(res, "Category name is required", 400);
      }

      if (!category_name_mandarin) {
        return errorResponse(res, "Category name is required", 400);
      }

      // Check if category name already exists
      const exists = await categoryService.checkCategoryNameExists(
        category_name_indo,
        null,
        isDoubleDatabase,
      );

      if (exists) {
        return errorResponse(res, "Category name already exists", 400);
      }

      const data = {
        category_name_indo: category_name_indo,
        category_name_mandarin: category_name_mandarin,
        foot_note: foot_note,
        is_active: true,
      };

      const category = await categoryService.create(data, isDoubleDatabase);

      return successResponse(
        res,
        category,
        "Category created successfully",
        201,
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update category
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        is_double_database,
        category_name_indo,
        category_name_mandarin,
        foot_note,
      } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if category exists
      const existing = await categoryService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Category not found", 404);
      }

      const data = {};

      if (category_name_indo) {
        // Check if new name already exists
        const nameExists = await categoryService.checkCategoryNameExists(
          category_name_indo,
          id,
          isDoubleDatabase,
        );

        if (nameExists) {
          return errorResponse(res, "Category name already exists", 400);
        }

        data.category_name_indo = category_name_indo;
        data.category_name_mandarin = category_name_mandarin;
        data.foot_note = foot_note;
      }

      const category = await categoryService.update(id, data, isDoubleDatabase);

      return successResponse(res, category, "Category updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete category
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      // Check if category exists
      const existing = await categoryService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Category not found", 404);
      }

      await categoryService.delete(id, isDoubleDatabase);

      return successResponse(res, null, "Category deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new CategoryController();
