const DualDatabaseService = require("./dualDatabase.service");
const { models } = require("../models");

class CategoryService extends DualDatabaseService {
  constructor() {
    super("Category");
  }

  /**
   * Get all categories with their sub-categories
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Categories with sub-categories
   */
  async getAllWithSubCategories(isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const options = {
      include: [
        {
          model: dbModels.SubCategory,
          as: "subCategories",
          required: false,
          where: { is_active: true },
        },
      ],
      order: [["category_name_indo", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Get all categories with their sub-categories
   * @param {Boolean} isDoubleDatabase
   * @param {Object} options - Query options
   * @returns {Array} Categories with sub-categories
   */
  async getAllWithRelations(options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.FlowProcess,
          as: "flow_process",
          required: false,
          where: { is_active: true },
        },
      ],
      order: [["category_name_indo", "ASC"]],
    };

    return await this.findAll(queryOptions, isDoubleDatabase);
  }

  /**
   * Get active categories only
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Active categories
   */
  async getActiveCategories(isDoubleDatabase = true) {
    const options = {
      where: { is_active: true },
      order: [["category_name_indo", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Get category by ID with sub-categories
   * @param {Number} id
   * @param {Boolean} isDoubleDatabase
   * @returns {Object|null} Category with sub-categories
   */
  async getByIdWithSubCategories(id, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const options = {
      include: [
        {
          model: dbModels.SubCategory,
          as: "subCategories",
          required: false,
        },
      ],
    };

    return await this.findById(id, options, isDoubleDatabase);
  }

  /**
   * Check if category name already exists
   * @param {String} categoryName
   * @param {Number|null} excludeId - ID to exclude from check (for updates)
   * @param {Boolean} isDoubleDatabase
   * @returns {Boolean} True if exists
   */
  async checkCategoryNameExists(
    categoryNameIndo,
    excludeId = null,
    isDoubleDatabase = true
  ) {
    const where = { category_name_indo: categoryNameIndo };
    if (excludeId) {
      where.id = { [require("sequelize").Op.ne]: excludeId };
    }

    const existing = await this.findOne({ where }, isDoubleDatabase);
    return existing !== null;
  }
}
module.exports = new CategoryService();
