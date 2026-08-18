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
    isDoubleDatabase = true,
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
      order: [["createdAt", "DESC"]],
    };

    //if page and limit not set, use normal findAll
    if (!page || !limit) {
      return await this.findAll(queryOptions, isDoubleDatabase);
    }

    //if page and limit are set, use pagination
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
          model: dbModels.ServicePricingGovernmentCost,
          as: "government_cost",
          separate: true,
          order: [["index", "ASC"]],
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
   * Create government cost -> tables -> fields for a given service pricing (CREATE-ONLY, no delete/update logic)
   *
   * @param {Object} params
   * @param {Number} params.idServicePricing
   * @param {Array} params.governmentCostList
   * @param {Object} params.transaction1
   * @param {Object} params.transaction2
   * @param {Boolean} params.isDoubleDatabase
   * @returns {Array} Created government cost records with their tables and fields
   */
  async createGovernmentCostWithTables({
    idServicePricing,
    governmentCostList = [],
    transaction1,
    transaction2,
    isDoubleDatabase,
  }) {
    const results = [];

    for (const item of governmentCostList) {
      const { tables = [], ...governmentCostData } = item;

      // 1. Create Government Cost in DB1
      const governmentCostRecord1 =
        await models.db1.ServicePricingGovernmentCost.create(
          { ...governmentCostData, id_service_pricing: idServicePricing },
          { transaction: transaction1 },
        );

      // 2. Create Government Cost in DB2 with same ID
      if (isDoubleDatabase) {
        await models.db2.ServicePricingGovernmentCost.create(
          {
            ...governmentCostData,
            id: governmentCostRecord1.id,
            id_service_pricing: idServicePricing,
          },
          { transaction: transaction2 },
        );
      }

      // 3. Create Tables + their Fields for this Government Cost
      const tablesResult = await this.createTablesWithFields({
        idGovernmentCost: governmentCostRecord1.id,
        tablesList: tables,
        transaction1,
        transaction2,
        isDoubleDatabase,
      });

      results.push({
        government_cost: governmentCostRecord1.toJSON(),
        tables: tablesResult,
      });
    }

    return results;
  }

  /**
   * Create tables + their fields for a given government cost (CREATE-ONLY)
   *
   * @param {Object} params
   * @param {Number} params.idGovernmentCost
   * @param {Array} params.tablesList
   * @param {Object} params.transaction1
   * @param {Object} params.transaction2
   * @param {Boolean} params.isDoubleDatabase
   * @returns {Array} Created table records with their fields
   */
  async createTablesWithFields({
    idGovernmentCost,
    tablesList = [],
    transaction1,
    transaction2,
    isDoubleDatabase,
  }) {
    const results = [];

    for (const item of tablesList) {
      const { fields = [], ...tableData } = item;

      // 1. Create Table in DB1
      const tableRecord1 =
        await models.db1.ServicePricingGovernmentCostTable.create(
          {
            ...tableData,
            id_service_pricing_government_cost: idGovernmentCost,
          },
          { transaction: transaction1 },
        );

      // 2. Create Table in DB2 with same ID
      if (isDoubleDatabase) {
        await models.db2.ServicePricingGovernmentCostTable.create(
          {
            ...tableData,
            id: tableRecord1.id,
            id_service_pricing_government_cost: idGovernmentCost,
          },
          { transaction: transaction2 },
        );
      }

      // 3. Prepare fields data with foreign key
      const fieldsData = fields.map((field) => ({
        ...field,
        id_service_pricing_government_cost_table: tableRecord1.id,
      }));

      // 4. Sync Fields
      const fieldsResult = await syncChildRecords({
        Model1: models.db1.ServicePricingGovernmentCostField,
        Model2: isDoubleDatabase
          ? models.db2.ServicePricingGovernmentCostField
          : null,
        foreignKey: "id_service_pricing_government_cost_table",
        parentId: tableRecord1.id,
        newData: fieldsData,
        transaction1,
        transaction2,
        isDoubleDatabase,
      });

      results.push({
        table: tableRecord1.toJSON(),
        fields: fieldsResult,
      });
    }

    return results;
  }

  /**
   * Sync (create/update/delete) government cost -> tables -> fields for a given service pricing
   *
   * @param {Object} params
   * @param {Number} params.idServicePricing
   * @param {Array} params.governmentCostList
   * @param {Object} params.transaction1
   * @param {Object} params.transaction2
   * @param {Boolean} params.isDoubleDatabase
   * @returns {Array} Synced government cost records with their tables and fields
   */
  async syncGovernmentCostWithTables({
    idServicePricing,
    governmentCostList = [],
    transaction1,
    transaction2,
    isDoubleDatabase,
  }) {
    const ModelGovernmentCost1 = models.db1.ServicePricingGovernmentCost;
    const ModelGovernmentCost2 = models.db2.ServicePricingGovernmentCost;
    const ModelTable1 = models.db1.ServicePricingGovernmentCostTable;
    const ModelTable2 = models.db2.ServicePricingGovernmentCostTable;
    const ModelField1 = models.db1.ServicePricingGovernmentCostField;
    const ModelField2 = models.db2.ServicePricingGovernmentCostField;

    // 1. Get existing government cost records for this service pricing
    const existingGovernmentCost = await ModelGovernmentCost1.findAll({
      where: { id_service_pricing: idServicePricing },
      transaction: transaction1,
    });
    const existingIds = existingGovernmentCost.map((s) => s.id);
    const incomingIds = governmentCostList.filter((s) => s.id).map((s) => s.id);
    const idsToDelete = existingIds.filter((id) => !incomingIds.includes(id));

    // 2. Delete removed government cost records
    //    (delete fields -> tables -> government cost, because of onDelete: RESTRICT)
    if (idsToDelete.length > 0) {
      const tablesToDelete = await ModelTable1.findAll({
        where: { id_service_pricing_government_cost: idsToDelete },
        transaction: transaction1,
      });
      const tableIdsToDelete = tablesToDelete.map((t) => t.id);

      if (tableIdsToDelete.length > 0) {
        await ModelField1.destroy({
          where: {
            id_service_pricing_government_cost_table: tableIdsToDelete,
          },
          transaction: transaction1,
        });
        await ModelTable1.destroy({
          where: { id: tableIdsToDelete },
          transaction: transaction1,
        });
      }

      await ModelGovernmentCost1.destroy({
        where: { id: idsToDelete },
        transaction: transaction1,
      });

      if (isDoubleDatabase) {
        if (tableIdsToDelete.length > 0) {
          await ModelField2.destroy({
            where: {
              id_service_pricing_government_cost_table: tableIdsToDelete,
            },
            transaction: transaction2,
          });
          await ModelTable2.destroy({
            where: { id: tableIdsToDelete },
            transaction: transaction2,
          });
        }

        await ModelGovernmentCost2.destroy({
          where: { id: idsToDelete },
          transaction: transaction2,
        });
      }
    }

    // 3. Create/update each government cost item, then sync its tables
    const results = [];
    for (const item of governmentCostList) {
      const { id, tables = [], ...governmentCostData } = item;
      let governmentCostRecord1;

      if (id) {
        // Update existing government cost record
        await ModelGovernmentCost1.update(governmentCostData, {
          where: { id },
          transaction: transaction1,
        });
        if (isDoubleDatabase) {
          await ModelGovernmentCost2.update(governmentCostData, {
            where: { id },
            transaction: transaction2,
          });
        }
        governmentCostRecord1 = await ModelGovernmentCost1.findByPk(id, {
          transaction: transaction1,
        });
      } else {
        // Create new government cost record
        governmentCostRecord1 = await ModelGovernmentCost1.create(
          { ...governmentCostData, id_service_pricing: idServicePricing },
          { transaction: transaction1 },
        );
        if (isDoubleDatabase) {
          await ModelGovernmentCost2.create(
            {
              ...governmentCostData,
              id: governmentCostRecord1.id,
              id_service_pricing: idServicePricing,
            },
            { transaction: transaction2 },
          );
        }
      }

      // Sync tables (+ their fields) for this government cost record
      const tablesResult = await this.syncTablesWithFields({
        idGovernmentCost: governmentCostRecord1.id,
        tablesList: tables,
        transaction1,
        transaction2,
        isDoubleDatabase,
      });

      results.push({
        government_cost: governmentCostRecord1.toJSON(),
        tables: tablesResult,
      });
    }

    return results;
  }

  /**
   * Sync (create/update/delete) tables + their fields for a given government cost
   *
   * @param {Object} params
   * @param {Number} params.idGovernmentCost
   * @param {Array} params.tablesList
   * @param {Object} params.transaction1
   * @param {Object} params.transaction2
   * @param {Boolean} params.isDoubleDatabase
   * @returns {Array} Synced table records with their fields
   */
  async syncTablesWithFields({
    idGovernmentCost,
    tablesList = [],
    transaction1,
    transaction2,
    isDoubleDatabase,
  }) {
    const ModelTable1 = models.db1.ServicePricingGovernmentCostTable;
    const ModelTable2 = models.db2.ServicePricingGovernmentCostTable;
    const ModelField1 = models.db1.ServicePricingGovernmentCostField;
    const ModelField2 = models.db2.ServicePricingGovernmentCostField;

    // 1. Get existing table records for this government cost
    const existingTables = await ModelTable1.findAll({
      where: { id_service_pricing_government_cost: idGovernmentCost },
      transaction: transaction1,
    });
    const existingIds = existingTables.map((t) => t.id);
    const incomingIds = tablesList.filter((t) => t.id).map((t) => t.id);
    const idsToDelete = existingIds.filter((id) => !incomingIds.includes(id));

    // 2. Delete removed tables (delete fields first because of onDelete: RESTRICT)
    if (idsToDelete.length > 0) {
      await ModelField1.destroy({
        where: { id_service_pricing_government_cost_table: idsToDelete },
        transaction: transaction1,
      });
      await ModelTable1.destroy({
        where: { id: idsToDelete },
        transaction: transaction1,
      });

      if (isDoubleDatabase) {
        await ModelField2.destroy({
          where: { id_service_pricing_government_cost_table: idsToDelete },
          transaction: transaction2,
        });
        await ModelTable2.destroy({
          where: { id: idsToDelete },
          transaction: transaction2,
        });
      }
    }

    // 3. Create/update each table item, then sync its own fields
    const results = [];
    for (const item of tablesList) {
      const { id, fields = [], ...tableData } = item;
      let tableRecord1;

      if (id) {
        // Update existing table record
        await ModelTable1.update(tableData, {
          where: { id },
          transaction: transaction1,
        });
        if (isDoubleDatabase) {
          await ModelTable2.update(tableData, {
            where: { id },
            transaction: transaction2,
          });
        }
        tableRecord1 = await ModelTable1.findByPk(id, {
          transaction: transaction1,
        });
      } else {
        // Create new table record
        tableRecord1 = await ModelTable1.create(
          {
            ...tableData,
            id_service_pricing_government_cost: idGovernmentCost,
          },
          { transaction: transaction1 },
        );
        if (isDoubleDatabase) {
          await ModelTable2.create(
            {
              ...tableData,
              id: tableRecord1.id,
              id_service_pricing_government_cost: idGovernmentCost,
            },
            { transaction: transaction2 },
          );
        }
      }

      // Sync fields for this table record
      const fieldsData = fields.map((field) => ({
        ...field,
        id_service_pricing_government_cost_table: tableRecord1.id,
      }));

      const fieldsResult = await syncChildRecords({
        Model1: ModelField1,
        Model2: isDoubleDatabase ? ModelField2 : null,
        foreignKey: "id_service_pricing_government_cost_table",
        parentId: tableRecord1.id,
        newData: fieldsData,
        transaction1,
        transaction2,
        isDoubleDatabase,
      });

      results.push({
        table: tableRecord1.toJSON(),
        fields: fieldsResult,
      });
    }

    return results;
  }

  /**
   * Create multiple service pricing with variants and government cost in a single transaction
   *
   * @param {Array} servicePricingDataList - Array of service pricing data with variants and government cost
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Array} Created service pricing with variants and government cost
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
          const {
            variants = [],
            government_cost = [],
            ...servicePricingData
          } = item;

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

          // 5. Create Government Cost -> Tables -> Fields
          const governmentCostResult =
            await this.createGovernmentCostWithTables({
              idServicePricing: servicePricing1.id,
              governmentCostList: government_cost,
              transaction1,
              transaction2,
              isDoubleDatabase,
            });

          results.push({
            service_pricing: servicePricing1.toJSON(),
            variants: variantsResult,
            government_cost: governmentCostResult,
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
          const {
            variants = [],
            government_cost = [],
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

          const governmentCostResult =
            await this.createGovernmentCostWithTables({
              idServicePricing: servicePricing.id,
              governmentCostList: government_cost,
              transaction1,
              transaction2: null,
              isDoubleDatabase: false,
            });

          results.push({
            service_pricing: servicePricing.toJSON(),
            variants: variantsResult,
            government_cost: governmentCostResult,
          });
        }

        await transaction1.commit();
        console.log(
          `✅ ${servicePricingDataList.length} Service Pricing records created in DB1 only`,
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
   * Update service pricing with variants and government cost in a single transaction
   *
   * @param {Number} id - Service Pricing ID
   * @param {Object} servicePricingData - Service pricing data to update
   * @param {Array} variantsData - Service pricing variants data
   * @param {Array} governmentCostData - Government cost data (with nested tables & fields)
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Object} Updated service pricing with variants and government cost operation result
   */
  async updateWithVariants(
    id,
    servicePricingData,
    variantsData = [],
    governmentCostData = [],
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
        const [updatedRows1] = await this.Model1.update(
          { ...servicePricingData, status: "pending" },
          {
            where: { id },
            transaction: transaction1,
          },
        );

        const [updatedRows2] = await this.Model2.update(
          { ...servicePricingData, status: "pending" },
          {
            where: { id },
            transaction: transaction2,
          },
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

        // 3. Sync Government Cost -> Tables -> Fields (Create/Update/Delete)
        const governmentCostResult = await this.syncGovernmentCostWithTables({
          idServicePricing: id,
          governmentCostList: governmentCostData,
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
              model: models.db1.ServicePricingGovernmentCost,
              as: "government_cost",
              separate: true,
              order: [["index", "ASC"]],
              include: [
                {
                  model: models.db1.ServicePricingGovernmentCostTable,
                  as: "tables",
                  separate: true,
                  order: [["index", "ASC"]],
                  include: [
                    {
                      model: models.db1.ServicePricingGovernmentCostField,
                      as: "fields",
                    },
                  ],
                },
              ],
            },
          ],
        });

        return {
          service_pricing: updated ? updated.toJSON() : null,
          variants: variantsResult,
          government_cost: governmentCostResult,
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
          Model1: models.db1.ServicePricingVariant,
          Model2: null,
          foreignKey: "id_service_pricing",
          parentId: id,
          newData: variantsData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        const governmentCostResult = await this.syncGovernmentCostWithTables({
          idServicePricing: id,
          governmentCostList: governmentCostData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        await transaction1.commit();
        console.log(`✅ Service Pricing with variants updated in DB1 only`);

        const updated = await this.Model1.findByPk(id, {
          include: [
            {
              model: models.db1.ServicePricingVariant,
              as: "variants",
            },
            {
              model: models.db1.ServicePricingGovernmentCost,
              as: "government_cost",
              separate: true,
              order: [["index", "ASC"]],
              include: [
                {
                  model: models.db1.ServicePricingGovernmentCostTable,
                  as: "tables",
                  separate: true,
                  order: [["index", "ASC"]],
                  include: [
                    {
                      model: models.db1.ServicePricingGovernmentCostField,
                      as: "fields",
                    },
                  ],
                },
              ],
            },
          ],
        });

        return {
          service_pricing: updated ? updated.toJSON() : null,
          variants: variantsResult,
          government_cost: governmentCostResult,
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
