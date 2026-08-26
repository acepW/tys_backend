const { Op } = require("sequelize");
const DualDatabaseService = require("../dualDatabase.service");
const { models } = require("../../models");

class ServicePricingGovernmentCostService extends DualDatabaseService {
  constructor() {
    super("ServicePricingGovernmentCost");
  }

  /**
   * Get all government costs with relations (tables + fields),
   * support pagination and search by title_indo / title_mandarin.
   * @param {Object} options - base query options, mis. { where: { id_service_pricing } }
   * @param {String|null} search - dicari di title_indo ATAU title_mandarin
   * @param {Number|null} page
   * @param {Number|null} limit
   * @param {Boolean} isDoubleDatabase
   */
  async getAllWithRelations(
    options = {},
    page = null,
    limit = null,
    isDoubleDatabase = true,
  ) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.ServicePricingGovernmentCostTable,
          as: "tables",
          separate: true,
          order: [["index", "ASC"]],
          include: [
            {
              model: dbModels.ServicePricingGovernmentCostField,
              as: "fields",
              attributes: [
                "id",
                "field_name_indo",
                "field_name_mandarin",
                "field_type",
                "field_value",
                "value_indo",
                "value_mandarin",
                "is_active",
              ],
            },
          ],
        },
      ],
      order: [["index", "ASC"]],
    };

    // tanpa page/limit -> findAll biasa
    if (!page || !limit) {
      return await this.findAll(queryOptions, isDoubleDatabase);
    }

    // dengan page/limit -> pagination
    const offset = (page - 1) * limit;
    const { count, rows } = await this.findAndCountAll(
      { ...queryOptions, limit, offset },
      isDoubleDatabase,
    );

    return {
      data: rows,
      pagination: {
        total_data: count,
        total_page: Math.ceil(count / limit),
        current_page: page,
        per_page: limit,
      },
    };
  }
}

module.exports = new ServicePricingGovernmentCostService();
