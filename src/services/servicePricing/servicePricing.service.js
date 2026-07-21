const DualDatabaseService = require("../dualDatabase.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");

class ServicePricingService extends DualDatabaseService {
  constructor() {
    super("ServicePricing");
  }

  async getAllWithRelations(
    options = {},
    page = null,
    limit = null,
    isDoubleDatabase = true
  ) {
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
          model: dbModels.ServicePricingSupporting,
          as: "supporting",
          separate: true,
          include: [
            {
              model: dbModels.ServicePricingVariantSupporting,
              as: "variants_supporting",
            },
          ],
        },
        {
          model: dbModels.Category,
          as: "category",
          attributes: ["id", "category_name_indo", "category_name_mandarin"],
        },
        {
          model: dbModels.ServiceCode,
          as: "service_code",
        },
        {
          model: dbModels.Product,
          as: "product",
          attributes: ["id", "id_category"],
        },
        {
          model: dbModels.Division,
          as: "division",
          attributes: ["id", "division_name"],
        },
        {
          model: dbModels.ProjectPlan,
          as: "project_plans",
          include: [
            {
              model: dbModels.ProjectPlanPoint,
              as: "project_plan_points",
            },
            {
              model: dbModels.ProjectPlanCost,
              as: "project_plan_costs",
            },
          ],
        },
        {
          model: dbModels.User,
          as: "user_create",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_approve",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_reject",
          attributes: ["id", "name", "email"],
        },
      ],
    };

    //if page and limit not set, use normal findAll
    if (!page || !limit) {
      return await this.findAll(queryOptions, isDoubleDatabase);
    }

    //if page and limit are set, use pagination
    const offset = (page - 1) * limit;
    const { count, rows } = await this.findAndCountAll(
      { ...queryOptions, limit, offset },
      isDoubleDatabase
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
          model: dbModels.ServicePricingSupporting,
          as: "supporting",
          separate: true,
          include: [
            {
              model: dbModels.ServicePricingVariantSupporting,
              as: "variants_supporting",
            },
          ],
        },
        {
          model: dbModels.Category,
          as: "category",
          attributes: ["id", "category_name_indo", "category_name_mandarin"],
        },
        {
          model: dbModels.ServiceCode,
          as: "service_code",
        },
        {
          model: dbModels.Product,
          as: "product",
          attributes: ["id", "id_category"],
        },
        {
          model: dbModels.Division,
          as: "division",
          attributes: ["id", "division_name"],
        },
        {
          model: dbModels.ProjectPlan,
          as: "project_plans",
          include: [
            {
              model: dbModels.ProjectPlanPoint,
              as: "project_plan_points",
            },
            {
              model: dbModels.ProjectPlanCost,
              as: "project_plan_costs",
            },
          ],
        },
        {
          model: dbModels.User,
          as: "user_create",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_approve",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_reject",
          attributes: ["id", "name", "email"],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Get service pricing serial number
   * @param {Number} id_category
   * @param {Number} id_service_code
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Service pricing with relations
   */
  async getSerialNumber(id_category, id_service_code, isDoubleDatabase = true) {
    const getData = await this.count({
      where: {
        id_category,
        id_service_code,
      },
      isDoubleDatabase,
    });

    return {
      data_total: getData,
      next_serial_number: String(getData + 1).padStart(2, "0"),
    };
  }

  /**
   * Create supporting records with their variants for a given service pricing
   *
   * @param {Object} params
   * @param {Number} params.idServicePricing
   * @param {Array} params.supportingList
   * @param {Object} params.transaction1
   * @param {Object} params.transaction2
   * @param {Boolean} params.isDoubleDatabase
   * @returns {Array} Created supporting records with their variants
   */
  async createSupportingWithVariants({
    idServicePricing,
    supportingList = [],
    transaction1,
    transaction2,
    isDoubleDatabase,
  }) {
    const results = [];

    for (const item of supportingList) {
      const { variants_supporting = [], ...supportingData } = item;

      // 1. Create Service Pricing Supporting in DB1
      const supportingRecord1 =
        await models.db1.ServicePricingSupporting.create(
          { ...supportingData, id_service_pricing: idServicePricing },
          { transaction: transaction1 }
        );

      // 2. Create Service Pricing Supporting in DB2 with same ID
      if (isDoubleDatabase) {
        await models.db2.ServicePricingSupporting.create(
          {
            ...supportingData,
            id: supportingRecord1.id,
            id_service_pricing: idServicePricing,
          },
          { transaction: transaction2 }
        );
      }

      // 3. Prepare variants_supporting data with foreign key
      const variantsSupportingData = variants_supporting.map((variant) => ({
        ...variant,
        id_service_pricing_supporting: supportingRecord1.id,
      }));

      // 4. Sync Service Pricing Variant Supporting
      const variantsResult = await syncChildRecords({
        Model1: models.db1.ServicePricingVariantSupporting,
        Model2: isDoubleDatabase
          ? models.db2.ServicePricingVariantSupporting
          : null,
        foreignKey: "id_service_pricing_supporting",
        parentId: supportingRecord1.id,
        newData: variantsSupportingData,
        transaction1,
        transaction2,
        isDoubleDatabase,
      });

      results.push({
        supporting: supportingRecord1.toJSON(),
        variants_supporting: variantsResult,
      });
    }

    return results;
  }

  /**
   * Sync (create/update/delete) supporting records + their variants for a given service pricing
   *
   * @param {Object} params
   * @param {Number} params.idServicePricing
   * @param {Array} params.supportingList
   * @param {Object} params.transaction1
   * @param {Object} params.transaction2
   * @param {Boolean} params.isDoubleDatabase
   * @returns {Array} Synced supporting records with their variants
   */
  async syncSupportingWithVariants({
    idServicePricing,
    supportingList = [],
    transaction1,
    transaction2,
    isDoubleDatabase,
  }) {
    const ModelSupporting1 = models.db1.ServicePricingSupporting;
    const ModelSupporting2 = models.db2.ServicePricingSupporting;
    const ModelVariantSupporting1 = models.db1.ServicePricingVariantSupporting;
    const ModelVariantSupporting2 = models.db2.ServicePricingVariantSupporting;

    // 1. Get existing supporting records for this service pricing
    const existingSupporting = await ModelSupporting1.findAll({
      where: { id_service_pricing: idServicePricing },
      transaction: transaction1,
    });
    const existingIds = existingSupporting.map((s) => s.id);
    const incomingIds = supportingList.filter((s) => s.id).map((s) => s.id);
    const idsToDelete = existingIds.filter((id) => !incomingIds.includes(id));

    // 2. Delete removed supporting records
    //    (delete variants_supporting first because of onDelete: RESTRICT)
    if (idsToDelete.length > 0) {
      await ModelVariantSupporting1.destroy({
        where: { id_service_pricing_supporting: idsToDelete },
        transaction: transaction1,
      });
      await ModelSupporting1.destroy({
        where: { id: idsToDelete },
        transaction: transaction1,
      });

      if (isDoubleDatabase) {
        await ModelVariantSupporting2.destroy({
          where: { id_service_pricing_supporting: idsToDelete },
          transaction: transaction2,
        });
        await ModelSupporting2.destroy({
          where: { id: idsToDelete },
          transaction: transaction2,
        });
      }
    }

    // 3. Create/update each supporting item, then sync its own variants_supporting
    const results = [];
    for (const item of supportingList) {
      const { id, variants_supporting = [], ...supportingData } = item;
      let supportingRecord1;

      if (id) {
        // Update existing supporting record
        await ModelSupporting1.update(supportingData, {
          where: { id },
          transaction: transaction1,
        });
        if (isDoubleDatabase) {
          await ModelSupporting2.update(supportingData, {
            where: { id },
            transaction: transaction2,
          });
        }
        supportingRecord1 = await ModelSupporting1.findByPk(id, {
          transaction: transaction1,
        });
      } else {
        // Create new supporting record
        supportingRecord1 = await ModelSupporting1.create(
          { ...supportingData, id_service_pricing: idServicePricing },
          { transaction: transaction1 }
        );
        if (isDoubleDatabase) {
          await ModelSupporting2.create(
            {
              ...supportingData,
              id: supportingRecord1.id,
              id_service_pricing: idServicePricing,
            },
            { transaction: transaction2 }
          );
        }
      }

      // Sync variants_supporting for this supporting record
      const variantsSupportingData = variants_supporting.map((variant) => ({
        ...variant,
        id_service_pricing_supporting: supportingRecord1.id,
      }));

      const variantsResult = await syncChildRecords({
        Model1: ModelVariantSupporting1,
        Model2: isDoubleDatabase ? ModelVariantSupporting2 : null,
        foreignKey: "id_service_pricing_supporting",
        parentId: supportingRecord1.id,
        newData: variantsSupportingData,
        transaction1,
        transaction2,
        isDoubleDatabase,
      });

      results.push({
        supporting: supportingRecord1.toJSON(),
        variants_supporting: variantsResult,
      });
    }

    return results;
  }

  /**
   * Create multiple service pricing with variants and supporting in a single transaction
   *
   * @param {Array} servicePricingDataList - Array of service pricing data with variants and supporting
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Array} Created service pricing with variants and supporting
   */
  async createMultipleWithVariants(
    servicePricingDataList = [],
    isDoubleDatabase = true
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Creating ${servicePricingDataList.length} Service Pricing records with variants in both databases...`
        );

        const results = [];

        // Loop through each service pricing data
        for (const item of servicePricingDataList) {
          const {
            variants = [],
            supporting = [],
            ...servicePricingData
          } = item;

          // 1. Create Service Pricing in DB1
          const servicePricing1 = await this.Model1.create(servicePricingData, {
            transaction: transaction1,
          });
          console.log(
            `✅ Created Service Pricing in DB1 with ID: ${servicePricing1.id}`
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
            `✅ Created Service Pricing in DB2 with ID: ${servicePricing1.id}`
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

          // 5. Create Service Pricing Supporting + their variants
          const supportingResult = await this.createSupportingWithVariants({
            idServicePricing: servicePricing1.id,
            supportingList: supporting,
            transaction1,
            transaction2,
            isDoubleDatabase,
          });

          results.push({
            service_pricing: servicePricing1.toJSON(),
            variants: variantsResult,
            supporting: supportingResult,
          });
        }

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(
          `✅ ${servicePricingDataList.length} Service Pricing records with variants successfully created`
        );

        return results;
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const results = [];

        for (const item of servicePricingDataList) {
          const {
            variants = [],
            supporting = [],
            ...servicePricingData
          } = item;

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

          const supportingResult = await this.createSupportingWithVariants({
            idServicePricing: servicePricing.id,
            supportingList: supporting,
            transaction1,
            transaction2: null,
            isDoubleDatabase: false,
          });

          results.push({
            service_pricing: servicePricing.toJSON(),
            variants: variantsResult,
            supporting: supportingResult,
          });
        }

        await transaction1.commit();
        console.log(
          `✅ ${servicePricingDataList.length} Service Pricing records created in DB2 only`
        );

        return results;
      }
    } catch (error) {
      console.error(
        `❌ Error creating Service Pricing with variants:`,
        error.message
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(
        `Failed to create Service Pricing with variants: ${error.message}`
      );
    }
  }

  /**
   * Update service pricing with variants and supporting in a single transaction
   *
   * @param {Number} id - Service Pricing ID
   * @param {Object} servicePricingData - Service pricing data to update
   * @param {Array} variantsData - Service pricing variants data
   * @param {Array} supportingData - Service pricing supporting data (with nested variants_supporting)
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Object} Updated service pricing with variants and supporting operation result
   */
  async updateWithVariants(
    id,
    servicePricingData,
    variantsData = [],
    supportingData = [],
    isDoubleDatabase = true
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Updating Service Pricing ID ${id} with variants...`);

        // 1. Update Service Pricing in both databases
        const [updatedRows1] = await this.Model1.update(
          { ...servicePricingData, status: "pending" },
          {
            where: { id },
            transaction: transaction1,
          }
        );

        const [updatedRows2] = await this.Model2.update(
          { ...servicePricingData, status: "pending" },
          {
            where: { id },
            transaction: transaction2,
          }
        );

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

        // 3. Sync Service Pricing Supporting + their variants (Create/Update/Delete)
        const supportingResult = await this.syncSupportingWithVariants({
          idServicePricing: id,
          supportingList: supportingData,
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
            {
              model: models.db1.ServicePricingSupporting,
              as: "supporting",
              include: [
                {
                  model: models.db1.ServicePricingVariantSupporting,
                  as: "variants_supporting",
                },
              ],
            },
          ],
        });

        return {
          service_pricing: updated ? updated.toJSON() : null,
          variants: variantsResult,
          supporting: supportingResult,
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

        const supportingResult = await this.syncSupportingWithVariants({
          idServicePricing: id,
          supportingList: supportingData,
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
            {
              model: models.db2.ServicePricingSupporting,
              as: "supporting",
              include: [
                {
                  model: models.db2.ServicePricingVariantSupporting,
                  as: "variants_supporting",
                },
              ],
            },
          ],
        });

        return {
          service_pricing: updated ? updated.toJSON() : null,
          variants: variantsResult,
          supporting: supportingResult,
        };
      }
    } catch (error) {
      console.error(
        `❌ Error updating Service Pricing with variants:`,
        error.message
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(
        `Failed to update Service Pricing with variants: ${error.message}`
      );
    }
  }
}

module.exports = new ServicePricingService();
