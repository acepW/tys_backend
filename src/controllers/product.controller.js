const productService = require("../services/masterProduct/product.service");
const productFieldService = require("../services/masterProduct/productField.service");
const categoryService = require("../services/category.service");
const subCategoryService = require("../services/subCategory.service");
const { successResponse, errorResponse } = require("../utils/response");

class ProductController {
  /**
   * Get all products
   */
  async getAll(req, res) {
    try {
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";
      const products = await productService.getAllWithRelations(
        {},
        isDoubleDatabase
      );

      return successResponse(res, products, "Products retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get product by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, with_sub } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const products = await productService.getById(id, {}, isDoubleDatabase);

      return successResponse(res, products, "Products retrieved successfully");
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
        id_category,
        id_sub_category,
        product_fields,
      } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Validation
      if (!id_category) {
        return errorResponse(res, "Category is required", 400);
      }
      if (!id_sub_category) {
        return errorResponse(res, "Sub Category is required", 400);
      }

      const checkDataCategory = await categoryService.findById(
        id_category,
        {},
        isDoubleDatabase
      );
      if (!checkDataCategory) {
        return errorResponse(res, "Category not found", 400);
      }
      const checkDataSubCategory = await subCategoryService.findById(
        id_sub_category,
        {},
        isDoubleDatabase
      );
      if (!checkDataSubCategory) {
        return errorResponse(res, "Sub-category not found", 400);
      }

      const data = {
        id_category: id_category,
        id_sub_category: id_sub_category,
        is_active: true,
      };

      const product = await productService.createWithFields(
        data,
        product_fields,
        isDoubleDatabase
      );

      return successResponse(res, product, "Product created successfully", 201);
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
        id_category,
        id_sub_category,
        product_fields,
      } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if category exists
      const existing = await productService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Category not found", 404);
      }

      const data = {
        id_category: id_category,
        id_sub_category: id_sub_category,
      };

      const product = await productService.updateWithFields(
        id,
        data,
        product_fields,
        isDoubleDatabase
      );

      return successResponse(res, product, "Product updated successfully");
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
      const existing = await productService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Category not found", 404);
      }

      await productService.delete(id, isDoubleDatabase);

      return successResponse(res, null, "Category deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new ProductController();
