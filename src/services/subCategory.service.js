const DualDatabaseService = require("./dualDatabase.service");
const { models } = require("../models");

class SubCategoryService extends DualDatabaseService {
  constructor() {
    super("SubCategory");
  }

  /**
   * Get all sub-categories with category info
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Sub-categories with category
   */
  async getAllWithCategory(isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const options = {
      include: [
        {
          model: dbModels.Category,
          as: "category",
          attributes: ["id", "category_name", "is_active"],
        },
      ],
      order: [["sub_category_name", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Get sub-categories by category ID
   * @param {Number} categoryId
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Sub-categories
   */
  async getByCategoryId(categoryId, isDoubleDatabase = true) {
    const options = {
      where: {
        id_category: categoryId,
        is_active: true,
      },
      order: [["sub_category_name", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Create sub-category with validation
   * @param {Object} data
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Created sub-category
   */
  async createWithValidation(data, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    // Validate category exists
    const category = await dbModels.Category.findByPk(data.id_category);
    if (!category) {
      throw new Error("Category not found");
    }

    if (!category.is_active) {
      throw new Error("Cannot add sub-category to inactive category");
    }

    return await this.create(data, isDoubleDatabase);
  }

  /**
   * Check if sub-category name exists in category
   * @param {Number} categoryId
   * @param {String} subCategoryName
   * @param {Number|null} excludeId
   * @param {Boolean} isDoubleDatabase
   * @returns {Boolean}
   */
  async checkSubCategoryExists(
    categoryId,
    subCategoryName,
    excludeId = null,
    isDoubleDatabase = true,
  ) {
    const where = {
      id_category: categoryId,
      sub_category_name: subCategoryName,
    };

    if (excludeId) {
      where.id = { [require("sequelize").Op.ne]: excludeId };
    }

    const existing = await this.findOne({ where }, isDoubleDatabase);
    return existing !== null;
  }
}

module.exports = new SubCategoryService();
