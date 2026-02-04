const DualDatabaseService = require("../dualDatabase.service");
const { models } = require("../../models");

class ServicePricingVariantService extends DualDatabaseService {
  constructor() {
    super("ServicePricingVariant");
  }

  /**
   * Get all variants with service pricing relation
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Variants with relations
   */
  async getAllWithRelations(options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.ServicePricing,
          as: "service_pricing",
        },
      ],
    };

    return await this.findAll(queryOptions, isDoubleDatabase);
  }

  /**
   * Get variant by ID with relations
   * @param {Number} id
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Variant with relations
   */
  async getById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.ServicePricing,
          as: "service_pricing",
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Get variants by service pricing ID
   * @param {Number} servicePricingId
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Variants
   */
  async getByServicePricing(servicePricingId, isDoubleDatabase = true) {
    const options = {
      where: { id_service_pricing: servicePricingId },
    };

    return await this.findAll(options, isDoubleDatabase);
  }
}

module.exports = new ServicePricingVariantService();
