const DualDatabaseService = require("../dualDatabase.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");

class FlowProcessService extends DualDatabaseService {
  constructor() {
    super("FlowProcess");
  }

  /**
   * Get all flow processes with relations
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Flow processes with relations
   */
  async getAllWithRelations(options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.Category,
          as: "category",
          attributes: ["id", "category_name_indo", "category_name_mandarin"],
        },
      ],
    };

    return await this.findAll(queryOptions, isDoubleDatabase);
  }

  /**
   * Get flow process by ID with relations
   * @param {Number} id
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Flow process with relations
   */
  async getById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.Category,
          as: "category",
          attributes: ["id", "category_name_indo", "category_name_mandarin"],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Get active flow processes
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Active flow processes
   */
  async getActiveFlowProcesses(isDoubleDatabase = true) {
    const options = {
      where: { is_active: true },
      order: [["project_name_indo", "ASC"]],
    };

    return await this.getAllWithRelations(options, isDoubleDatabase);
  }

  /**
   * Get flow processes by category
   * @param {Number} categoryId
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Flow processes for the category
   */
  async getByCategory(categoryId, isDoubleDatabase = true) {
    const options = {
      where: { id_category: categoryId },
      order: [["project_name_indo", "ASC"]],
    };

    return await this.getAllWithRelations(options, isDoubleDatabase);
  }

  /**
   * Get active flow processes by category
   * @param {Number} categoryId
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Active flow processes for the category
   */
  async getActiveByCategoryId(categoryId, isDoubleDatabase = true) {
    const options = {
      where: {
        id_category: categoryId,
        is_active: true,
      },
      order: [["project_name_indo", "ASC"]],
    };

    return await this.getAllWithRelations(options, isDoubleDatabase);
  }

  /**
   * Search flow processes by project name (Indonesian or Mandarin)
   * @param {String} searchTerm
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Matching flow processes
   */
  async searchByProjectName(searchTerm, isDoubleDatabase = true) {
    const { Op } = require("sequelize");

    const options = {
      where: {
        [Op.or]: [
          {
            project_name_indo: {
              [Op.like]: `%${searchTerm}%`,
            },
          },
          {
            project_name_mandarin: {
              [Op.like]: `%${searchTerm}%`,
            },
          },
        ],
      },
      order: [["project_name_indo", "ASC"]],
    };

    return await this.getAllWithRelations(options, isDoubleDatabase);
  }

  /**
   * Check if category exists before operations
   * @param {Number} categoryId
   * @param {Boolean} isDoubleDatabase
   * @returns {Boolean}
   */
  async checkCategoryExists(categoryId, isDoubleDatabase = true) {
    const db = isDoubleDatabase ? db1 : db2;
    const category = await db.Category.findByPk(categoryId);
    return category !== null;
  }

  /**
   * Create multiple flow processes in a single transaction
   *
   * @param {Array} flowProcessDataList - Array of flow process data
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Array} Created flow processes
   */
  async createMultiple(flowProcessDataList = [], isDoubleDatabase = true) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Creating ${flowProcessDataList.length} Flow Process records in both databases...`
        );

        const results = [];

        // Loop through each flow process data
        for (const flowProcessData of flowProcessDataList) {
          // 1. Create Flow Process in DB1
          const flowProcess1 = await this.Model1.create(flowProcessData, {
            transaction: transaction1,
          });
          console.log(
            `✅ Created Flow Process in DB1 with ID: ${flowProcess1.id}`
          );

          // 2. Create Flow Process in DB2 with same ID
          const flowProcessDataWithId = {
            ...flowProcessData,
            id: flowProcess1.id,
          };
          await this.Model2.create(flowProcessDataWithId, {
            transaction: transaction2,
          });
          console.log(
            `✅ Created Flow Process in DB2 with ID: ${flowProcess1.id}`
          );

          results.push(flowProcess1.toJSON());
        }

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(
          `✅ ${flowProcessDataList.length} Flow Process records successfully created`
        );

        return results;
      } else {
        // Single database (DB2 only)
        transaction1 = await db2.transaction();

        const results = [];

        for (const flowProcessData of flowProcessDataList) {
          const flowProcess = await this.Model2.create(flowProcessData, {
            transaction: transaction1,
          });

          results.push(flowProcess.toJSON());
        }

        await transaction1.commit();
        console.log(
          `✅ ${flowProcessDataList.length} Flow Process records created in DB2 only`
        );

        return results;
      }
    } catch (error) {
      console.error(`❌ Error creating Flow Processes:`, error.message);

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(`Failed to create Flow Processes: ${error.message}`);
    }
  }

  /**
   * Update multiple flow processes in a single transaction
   *
   * @param {Array} flowProcessUpdateList - Array of {id, ...updateData} objects
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Array} Update results
   */
  async updateMultiple(
    categoryId,
    flowProcessUpdateList = [],
    isDoubleDatabase = true
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Updating ${flowProcessUpdateList.length} Flow Process records in both databases...`
        );

        console.log(categoryId);

        const flowProcess = await syncChildRecords({
          Model1: models.db1.FlowProcess,
          Model2: models.db2.FlowProcess,
          foreignKey: "id_category",
          parentId: categoryId,
          newData: flowProcessUpdateList,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Flow Processes successfully updated`);

        return {
          flow_process: flowProcess,
        };
      } else {
        // Single database (DB2 only)
        transaction1 = await db2.transaction();

        const flowProcess = await syncChildRecords({
          Model1: models.db1.FlowProcess,
          Model2: null,
          foreignKey: "id_category",
          parentId: categoryId,
          newData: flowProcessUpdateList,
          transaction1,
          transaction2: null,
          isDoubleDatabase,
        });

        await transaction1.commit();
        console.log(`✅ Flow Processes updated in DB2 only`);

        return {
          flow_process: flowProcess,
        };
      }
    } catch (error) {
      console.error(`❌ Error updating Flow Processes:`, error.message);

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(`Failed to update Flow Processes: ${error.message}`);
    }
  }

  /**
   * Sync flow processes by category (Create/Update/Delete in one transaction)
   * Similar to syncChildRecords pattern
   *
   * @param {Number} categoryId - Category ID to sync flow processes for
   * @param {Array} newData - Array of flow process data (with or without id)
   *                          - If id is null/undefined: CREATE new record
   *                          - If id exists: UPDATE existing record
   *                          - Records not in newData: DELETE
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Object} Sync results with created, updated, and deleted counts
   */
  async syncFlowProcessesByCategory(
    categoryId,
    newData = [],
    isDoubleDatabase = true
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Syncing Flow Processes for Category ID ${categoryId} in both databases...`
        );

        // 1. Get existing flow processes for this category
        const existingRecords = await this.Model1.findAll({
          where: { id_category: categoryId },
          transaction: transaction1,
        });

        const existingIds = existingRecords.map((record) => record.id);
        const newIds = newData.filter((item) => item.id).map((item) => item.id);

        // 2. Determine which records to delete (exist in DB but not in newData)
        const idsToDelete = existingIds.filter((id) => !newIds.includes(id));

        // 3. Separate data into create and update
        const dataToCreate = newData.filter((item) => !item.id);
        const dataToUpdate = newData.filter((item) => item.id);

        const results = {
          created: [],
          updated: [],
          deleted: [],
        };

        // 4. DELETE records not in newData
        if (idsToDelete.length > 0) {
          console.log(`🗑️ Deleting ${idsToDelete.length} Flow Processes...`);

          await this.Model1.destroy({
            where: { id: idsToDelete },
            transaction: transaction1,
          });

          await this.Model2.destroy({
            where: { id: idsToDelete },
            transaction: transaction2,
          });

          results.deleted = idsToDelete;
          console.log(`✅ Deleted Flow Processes: ${idsToDelete.join(", ")}`);
        }

        // 5. CREATE new records
        if (dataToCreate.length > 0) {
          console.log(
            `➕ Creating ${dataToCreate.length} new Flow Processes...`
          );

          for (const item of dataToCreate) {
            const flowProcessData = {
              ...item,
              id_category: categoryId,
              is_active: item.is_active !== undefined ? item.is_active : true,
            };

            // Create in DB1
            const created1 = await this.Model1.create(flowProcessData, {
              transaction: transaction1,
            });

            // Create in DB2 with same ID
            await this.Model2.create(
              { ...flowProcessData, id: created1.id },
              { transaction: transaction2 }
            );

            results.created.push(created1.toJSON());
            console.log(`✅ Created Flow Process ID: ${created1.id}`);
          }
        }

        // 6. UPDATE existing records
        if (dataToUpdate.length > 0) {
          console.log(`✏️ Updating ${dataToUpdate.length} Flow Processes...`);

          for (const item of dataToUpdate) {
            const { id, ...updateData } = item;

            // Update in DB1
            await this.Model1.update(updateData, {
              where: { id },
              transaction: transaction1,
            });

            // Update in DB2
            await this.Model2.update(updateData, {
              where: { id },
              transaction: transaction2,
            });

            // Fetch updated record
            const updatedRecord = await this.Model1.findByPk(id, {
              transaction: transaction1,
            });

            if (updatedRecord) {
              results.updated.push(updatedRecord.toJSON());
              console.log(`✅ Updated Flow Process ID: ${id}`);
            }
          }
        }

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();

        console.log(
          `✅ Sync completed: ${results.created.length} created, ${results.updated.length} updated, ${results.deleted.length} deleted`
        );

        return results;
      } else {
        // Single database (DB2 only)
        transaction1 = await db2.transaction();

        console.log(
          `🔄 Syncing Flow Processes for Category ID ${categoryId} in DB2 only...`
        );

        const existingRecords = await this.Model2.findAll({
          where: { id_category: categoryId },
          transaction: transaction1,
        });

        const existingIds = existingRecords.map((record) => record.id);
        const newIds = newData.filter((item) => item.id).map((item) => item.id);
        const idsToDelete = existingIds.filter((id) => !newIds.includes(id));
        const dataToCreate = newData.filter((item) => !item.id);
        const dataToUpdate = newData.filter((item) => item.id);

        const results = {
          created: [],
          updated: [],
          deleted: [],
        };

        // DELETE
        if (idsToDelete.length > 0) {
          await this.Model2.destroy({
            where: { id: idsToDelete },
            transaction: transaction1,
          });
          results.deleted = idsToDelete;
        }

        // CREATE
        for (const item of dataToCreate) {
          const flowProcessData = {
            ...item,
            id_category: categoryId,
            is_active: item.is_active !== undefined ? item.is_active : true,
          };

          const created = await this.Model2.create(flowProcessData, {
            transaction: transaction1,
          });

          results.created.push(created.toJSON());
        }

        // UPDATE
        for (const item of dataToUpdate) {
          const { id, ...updateData } = item;

          await this.Model2.update(updateData, {
            where: { id },
            transaction: transaction1,
          });

          const updatedRecord = await this.Model2.findByPk(id, {
            transaction: transaction1,
          });

          if (updatedRecord) {
            results.updated.push(updatedRecord.toJSON());
          }
        }

        await transaction1.commit();

        console.log(
          `✅ Sync completed in DB2: ${results.created.length} created, ${results.updated.length} updated, ${results.deleted.length} deleted`
        );

        return results;
      }
    } catch (error) {
      console.error(
        `❌ Error syncing Flow Processes for Category ID ${categoryId}:`,
        error.message
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(`Failed to sync Flow Processes: ${error.message}`);
    }
  }
}

module.exports = new FlowProcessService();
