const DualDatabaseService = require("../dualDatabase.service");
const { models } = require("../../models");

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
          model: dbModels.product,
          as: "product",
        },
      ],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  async getById(id, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const options = {
      include: [
        {
          model: dbModels.product,
          as: "product",
        },
      ],
    };

    return await this.findById(id, options, isDoubleDatabase);
  }
}

module.exports = new ProductService();
