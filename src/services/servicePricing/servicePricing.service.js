const DualDatabaseService = require("../dualDatabase.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");

class ServicePricingService extends DualDatabaseService {
  constructor() {
    super("ServicePricing");
  }

  /**
   * Get all service pricing with relations
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Service pricing with relations
   */
  async getAllWithRelations(options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.ServicePricingVariant,
          as: "variants",
          separate: true,
          attributes: [
            "id",
            "price_idr",
            "price_rmb",
            "information_indo",
            "information_mandarin",
            "is_active",
          ],
        },
        {
          model: dbModels.Category,
          as: "category",
          attributes: ["id", "category_name_indo", "category_name_mandarin"],
        },
        {
          model: dbModels.Product,
          as: "product",
          attributes: ["id", "id_category"],
        },
      ],
    };

    return await this.findAll(queryOptions, isDoubleDatabase);
  }

  /**
   * Get service pricing by ID with relations
   * @param {Number} id
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Service pricing with relations
   */
  async getById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.ServicePricingVariant,
          as: "variants",
          attributes: [
            "id",
            "price_idr",
            "price_rmb",
            "information_indo",
            "information_mandarin",
            "is_active",
          ],
        },
        {
          model: dbModels.Category,
          as: "category",
          attributes: ["id", "category_name_indo", "category_name_mandarin"],
        },
        {
          model: dbModels.Product,
          as: "product",
          attributes: ["id", "id_category"],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Create multiple service pricing with variants in a single transaction
   *
   * @param {Array} servicePricingDataList - Array of service pricing data with variants
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Array} Created service pricing with variants
   */
  async createMultipleWithVariants(
    servicePricingDataList = [],
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Creating ${servicePricingDataList.length} Service Pricing records with variants in both databases...`,
        );

        const results = [];

        // Loop through each service pricing data
        for (const item of servicePricingDataList) {
          const { variants = [], ...servicePricingData } = item;

          // 1. Create Service Pricing in DB1
          const servicePricing1 = await this.Model1.create(servicePricingData, {
            transaction: transaction1,
          });
          console.log(
            `✅ Created Service Pricing in DB1 with ID: ${servicePricing1.id}`,
          );

          // 2. Create Service Pricing in DB2 with same ID
          const servicePricingDataWithId = {
            ...servicePricingData,
            id: servicePricing1.id,
          };
          await this.Model2.create(servicePricingDataWithId, {
            transaction: transaction2,
          });
          console.log(
            `✅ Created Service Pricing in DB2 with ID: ${servicePricing1.id}`,
          );

          // 3. Prepare variants data with foreign key
          const variantsData = variants.map((variant) => ({
            ...variant,
            id_service_pricing: servicePricing1.id,
          }));

          // 4. Sync Service Pricing Variants
          const variantsResult = await syncChildRecords({
            Model1: models.db1.ServicePricingVariant,
            Model2: models.db2.ServicePricingVariant,
            foreignKey: "id_service_pricing",
            parentId: servicePricing1.id,
            newData: variantsData,
            transaction1,
            transaction2,
            isDoubleDatabase,
          });

          results.push({
            service_pricing: servicePricing1.toJSON(),
            variants: variantsResult,
          });
        }

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(
          `✅ ${servicePricingDataList.length} Service Pricing records with variants successfully created`,
        );

        return results;
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const results = [];

        for (const item of servicePricingDataList) {
          const { variants = [], ...servicePricingData } = item;

          const servicePricing = await this.Model1.create(servicePricingData, {
            transaction: transaction1,
          });

          const variantsData = variants.map((variant) => ({
            ...variant,
            id_service_pricing: servicePricing.id,
          }));

          const variantsResult = await syncChildRecords({
            Model1: models.db1.ServicePricingVariant,
            Model2: null,
            foreignKey: "id_service_pricing",
            parentId: servicePricing.id,
            newData: variantsData,
            transaction1,
            transaction2: null,
            isDoubleDatabase: false,
          });

          results.push({
            service_pricing: servicePricing.toJSON(),
            variants: variantsResult,
          });
        }

        await transaction1.commit();
        console.log(
          `✅ ${servicePricingDataList.length} Service Pricing records created in DB2 only`,
        );

        return results;
      }
    } catch (error) {
      console.error(
        `❌ Error creating Service Pricing with variants:`,
        error.message,
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(
        `Failed to create Service Pricing with variants: ${error.message}`,
      );
    }
  }

  /**
   * Update service pricing with variants in a single transaction
   *
   * @param {Number} id - Service Pricing ID
   * @param {Object} servicePricingData - Service pricing data to update
   * @param {Array} variantsData - Service pricing variants data
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Object} Updated service pricing with variants operation result
   */
  async updateWithVariants(
    id,
    servicePricingData,
    variantsData = [],
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Updating Service Pricing ID ${id} with variants...`);

        // 1. Update Service Pricing in both databases
        const [updatedRows1] = await this.Model1.update(servicePricingData, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(servicePricingData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`Service Pricing with ID ${id} not found`);
        }

        console.log(`✅ Updated Service Pricing in both databases`);

        // 2. Sync Service Pricing Variants (Create/Update/Delete)
        const variantsResult = await syncChildRecords({
          Model1: models.db1.ServicePricingVariant,
          Model2: models.db2.ServicePricingVariant,
          foreignKey: "id_service_pricing",
          parentId: id,
          newData: variantsData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Service Pricing with variants successfully updated`);

        // Get updated service pricing
        const updated = await this.Model1.findByPk(id, {
          include: [
            {
              model: models.db1.ServicePricingVariant,
              as: "variants",
            },
          ],
        });

        return {
          service_pricing: updated ? updated.toJSON() : null,
          variants: variantsResult,
        };
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const [updatedRows] = await this.Model1.update(servicePricingData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`Service Pricing with ID ${id} not found`);
        }

        const variantsResult = await syncChildRecords({
          Model1: models.db2.ServicePricingVariant,
          Model2: null,
          foreignKey: "id_service_pricing",
          parentId: id,
          newData: variantsData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        await transaction1.commit();
        console.log(`✅ Service Pricing with variants updated in DB2 only`);

        const updated = await this.Model2.findByPk(id, {
          include: [
            {
              model: models.db2.ServicePricingVariant,
              as: "variants",
            },
          ],
        });

        return {
          service_pricing: updated ? updated.toJSON() : null,
          variants: variantsResult,
        };
      }
    } catch (error) {
      console.error(
        `❌ Error updating Service Pricing with variants:`,
        error.message,
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(
        `Failed to update Service Pricing with variants: ${error.message}`,
      );
    }
  }
}

module.exports = new ServicePricingService();
