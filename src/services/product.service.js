const DualDatabaseService = require("./dualDatabase.service");
const { models } = require("../models");

class ProductService extends DualDatabaseService {
  constructor() {
    super("Product");
  }

  /**
   * Get all products with category and sub-category
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Products with relations
   */
  async getAllWithRelations(isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const options = {
      include: [
        {
          model: dbModels.Category,
          as: "category",
          attributes: ["id", "category_name"],
        },
        {
          model: dbModels.SubCategory,
          as: "subCategory",
          attributes: ["id", "sub_category_name"],
        },
      ],
      order: [["product_name_indo", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  async getById(id, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const options = {
      include: [
        {
          model: dbModels.Category,
          as: "category",
          attributes: ["id", "category_name"],
        },
        {
          model: dbModels.SubCategory,
          as: "subCategory",
          attributes: ["id", "sub_category_name"],
        },
      ],
      order: [["product_name_indo", "ASC"]],
    };

    return await this.findById(id, options, isDoubleDatabase);
  }

  /**
   * Get products by category
   * @param {Number} categoryId
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Products
   */
  async getByCategory(categoryId, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const options = {
      where: { id_category: categoryId },
      include: [
        {
          model: dbModels.SubCategory,
          as: "subCategory",
          attributes: ["id", "sub_category_name"],
        },
      ],
      order: [["product_name_indo", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Get products by sub-category
   * @param {Number} subCategoryId
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Products
   */
  async getBySubCategory(subCategoryId, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const options = {
      where: { id_sub_category: subCategoryId },
      include: [
        {
          model: dbModels.Category,
          as: "category",
          attributes: ["id", "category_name"],
        },
      ],
      order: [["product_name_indo", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Create product with validation
   * @param {Object} data
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Created product
   */
  async createWithValidation(data, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    // Validate category exists
    const category = await dbModels.Category.findByPk(data.id_category);
    if (!category) {
      throw new Error("Category not found");
    }

    // Validate sub-category exists and belongs to the category
    const subCategory = await dbModels.SubCategory.findByPk(
      data.id_sub_category,
    );
    if (!subCategory) {
      throw new Error("Sub-category not found");
    }

    if (subCategory.id_category !== data.id_category) {
      throw new Error("Sub-category does not belong to the selected category");
    }

    return await this.create(data, isDoubleDatabase);
  }

  /**
   * Update product stock
   * @param {Number} id
   * @param {Number} qty - Quantity to add (positive) or reduce (negative)
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated product
   */
  async updateStock(id, qty, isDoubleDatabase = true) {
    const product = await this.findById(id, {}, isDoubleDatabase);
    if (!product) {
      throw new Error("Product not found");
    }

    const newQty = product.qty + qty;
    if (newQty < 0) {
      throw new Error("Insufficient stock");
    }

    return await this.update(id, { qty: newQty }, isDoubleDatabase);
  }

  /**
   * Search products by name
   * @param {String} searchTerm
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Matching products
   */
  async searchByName(searchTerm, isDoubleDatabase = true) {
    const { Op } = require("sequelize");
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const options = {
      where: {
        [Op.or]: [
          { product_name_indo: { [Op.like]: `%${searchTerm}%` } },
          { product_name_mandarin: { [Op.like]: `%${searchTerm}%` } },
        ],
      },
      include: [
        {
          model: dbModels.Category,
          as: "category",
          attributes: ["id", "category_name"],
        },
        {
          model: dbModels.SubCategory,
          as: "subCategory",
          attributes: ["id", "sub_category_name"],
        },
      ],
      order: [["product_name_indo", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Get low stock products
   * @param {Number} threshold
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Low stock products
   */
  async getLowStock(threshold = 10, isDoubleDatabase = true) {
    const { Op } = require("sequelize");

    const options = {
      where: {
        qty: { [Op.lte]: threshold },
        is_active: true,
      },
      order: [["qty", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }
}

module.exports = new ProductService();
