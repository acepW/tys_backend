const DualDatabaseService = require("../dualDatabase.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");

class GovernmentCostService extends DualDatabaseService {
  constructor() {
    super("GovernmentCost");
  }

  /**
   * Get all government costs with category and fields
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} GovernmentCosts with relations
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
          model: dbModels.GovernmentCostFields,
          as: "government_cost_fields",
          attributes: [
            "id",
            "field_name_indo",
            "field_name_mandarin",
            "field_value",
            "field_type",
          ],
        },
        {
          model: dbModels.Category,
          as: "category",
          attributes: ["id", "category_name_indo", "category_name_mandarin"],
        },
      ],
      order: [["createdAt", "DESC"]],
    };

    return await this.findAll(queryOptions, isDoubleDatabase);
  }

  /**
   * Get government cost by ID with relations
   * @param {Number} id
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} GovernmentCost with relations
   */
  async getById(id, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const options = {
      include: [
        {
          model: dbModels.GovernmentCostFields,
          as: "government_cost_fields",
          attributes: [
            "id",
            "field_name_indo",
            "field_name_mandarin",
            "field_value",
            "field_type",
          ],
        },
        {
          model: dbModels.Category,
          as: "category",
          attributes: ["id", "category_name_indo", "category_name_mandarin"],
        },
      ],
    };

    return await this.findById(id, options, isDoubleDatabase);
  }

  /**
   * Get government costs by category
   * @param {Number} categoryId
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} GovernmentCosts
   */
  async getByCategory(categoryId, isDoubleDatabase = true) {
    const options = {
      where: { id_category: categoryId },
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Create government cost with fields in a single transaction
   * Supports create, update, and delete of government cost fields
   *
   * @param {Object} governmentCostData - GovernmentCost data
   * @param {Array} fieldsData - GovernmentCost fields data
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Object} Created government cost with fields operation result
   */
  async createWithFields(
    governmentCostData,
    fieldsData = [],
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        let fieldsResultFilter = [];

        console.log(
          `🔄 Creating GovernmentCost with fields in both databases...`,
        );

        // 1. Create GovernmentCost in DB1
        const governmentCost1 = await this.Model1.create(governmentCostData, {
          transaction: transaction1,
        });
        console.log(
          `✅ Created GovernmentCost in DB1 with ID: ${governmentCost1.id}`,
        );

        // 2. Create GovernmentCost in DB2 with same ID
        const governmentCostDataWithId = {
          ...governmentCostData,
          id: governmentCost1.id,
        };
        await this.Model2.create(governmentCostDataWithId, {
          transaction: transaction2,
        });
        console.log(
          `✅ Created GovernmentCost in DB2 with ID: ${governmentCost1.id}`,
        );

        for (let index = 0; index < fieldsData.length; index++) {
          const e = fieldsData[index];
          fieldsResultFilter.push({
            ...e,
            id_government_cost: governmentCost1.id,
          });
        }

        // 3. Sync GovernmentCost Fields (Create/Update/Delete)
        const fieldsResult = await syncChildRecords({
          Model1: models.db1.GovernmentCostFields,
          Model2: models.db2.GovernmentCostFields,
          foreignKey: "id_government_cost",
          parentId: governmentCost1.id,
          newData: fieldsResultFilter,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ GovernmentCost with fields successfully created`);

        return {
          government_cost: governmentCost1.toJSON(),
          fields: fieldsResult,
        };
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        let fieldsResultFilter = [];

        const governmentCost = await this.Model1.create(governmentCostData, {
          transaction: transaction1,
        });

        for (let index = 0; index < fieldsData.length; index++) {
          const e = fieldsData[index];
          fieldsResultFilter.push({
            ...e,
            id_government_cost: governmentCost.id,
          });
        }

        const fieldsResult = await syncChildRecords({
          Model1: models.db1.GovernmentCostFields,
          Model2: null,
          foreignKey: "id_government_cost",
          parentId: governmentCost.id,
          newData: fieldsResultFilter,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        await transaction1.commit();
        console.log(`✅ GovernmentCost with fields created in DB1 only`);

        return {
          government_cost: governmentCost.toJSON(),
          fields: fieldsResult,
        };
      }
    } catch (error) {
      console.error(
        `❌ Error creating GovernmentCost with fields:`,
        error.message,
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(
        `Failed to create GovernmentCost with fields: ${error.message}`,
      );
    }
  }

  /**
   * Update government cost with fields in a single transaction
   * Supports create, update, and delete of government cost fields
   *
   * @param {Number} id - GovernmentCost ID
   * @param {Object} governmentCostData - GovernmentCost data to update
   * @param {Array} fieldsData - GovernmentCost fields data
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Object} Updated government cost with fields operation result
   */
  async updateWithFields(
    id,
    governmentCostData,
    fieldsData = [],
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Updating GovernmentCost ID ${id} with fields...`);

        // 1. Update GovernmentCost in both databases
        const [updatedRows1] = await this.Model1.update(governmentCostData, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(governmentCostData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`GovernmentCost with ID ${id} not found`);
        }

        console.log(`✅ Updated GovernmentCost in both databases`);

        // 2. Sync GovernmentCost Fields (Create/Update/Delete)
        const fieldsResult = await syncChildRecords({
          Model1: models.db1.GovernmentCostFields,
          Model2: models.db2.GovernmentCostFields,
          foreignKey: "id_government_cost",
          parentId: id,
          newData: fieldsData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ GovernmentCost with fields successfully updated`);

        // Get updated government cost
        const updated = await this.Model1.findByPk(id);

        return {
          government_cost: updated ? updated.toJSON() : null,
          fields: fieldsResult,
        };
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const [updatedRows] = await this.Model1.update(governmentCostData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`GovernmentCost with ID ${id} not found`);
        }

        const fieldsResult = await syncChildRecords({
          Model1: models.db1.GovernmentCostFields,
          Model2: null,
          foreignKey: "id_government_cost",
          parentId: id,
          newData: fieldsData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        await transaction1.commit();
        console.log(`✅ GovernmentCost with fields updated in DB1 only`);

        const updated = await this.Model1.findByPk(id);

        return {
          government_cost: updated ? updated.toJSON() : null,
          fields: fieldsResult,
        };
      }
    } catch (error) {
      console.error(
        `❌ Error updating GovernmentCost with fields:`,
        error.message,
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(
        `Failed to update GovernmentCost with fields: ${error.message}`,
      );
    }
  }

  /**
   * Get active government costs only
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Active GovernmentCosts
   */
  async getActive(isDoubleDatabase = true) {
    const options = {
      where: { is_active: true },
    };

    return await this.findAll(options, isDoubleDatabase);
  }
}

module.exports = new GovernmentCostService();
