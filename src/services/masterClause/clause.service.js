const DualDatabaseService = require("../dualDatabase.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");

class ClauseService extends DualDatabaseService {
  constructor() {
    super("Clause");
  }

  /**
   * Get all clauses with relations
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Clauses with relations
   */
  async getAllWithRelations(options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.ClausePoint,
          as: "clause_points",
          separate: true,
          attributes: [
            "id",
            "id_clause",
            "description_indo",
            "description_mandarin",
            "is_active",
          ],
        },
      ],
    };

    return await this.findAll(queryOptions, isDoubleDatabase);
  }

  /**
   * Get clause by ID with relations
   * @param {Number} id
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Clause with relations
   */
  async getById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.ClausePoint,
          as: "clause_points",
          attributes: [
            "id",
            "id_clause",
            "description_indo",
            "description_mandarin",
            "is_active",
          ],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Create or Update multiple clauses with clause points in a single transaction
   * Logic:
   * - If id is null/undefined => CREATE
   * - If id exists => UPDATE
   * - If existing clause_points not included in new data => DELETE
   *
   * @param {Array} clauseDataList - Array of clause data with clause_points
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Array} Created/Updated clauses with clause points
   */
  async upsertMultipleWithClausePoints(
    clauseDataList = [],
    isDoubleDatabase = true
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Processing ${clauseDataList.length} Clause records with clause points in both databases...`
        );

        const results = [];

        // Loop through each clause data
        for (const item of clauseDataList) {
          const { id, clause_points = [], ...clauseData } = item;

          let clauseId;
          let clause1;
          let isUpdate = false;

          if (id) {
            // UPDATE - Clause exists
            isUpdate = true;
            clauseId = id;

            console.log(`🔄 Updating Clause ID ${id}...`);

            // Update in DB1
            const [updatedRows1] = await this.Model1.update(clauseData, {
              where: { id },
              transaction: transaction1,
            });

            // Update in DB2
            const [updatedRows2] = await this.Model2.update(clauseData, {
              where: { id },
              transaction: transaction2,
            });

            if (updatedRows1 === 0 && updatedRows2 === 0) {
              throw new Error(`Clause with ID ${id} not found`);
            }

            // Fetch updated clause from DB1
            clause1 = await this.Model1.findByPk(id, {
              transaction: transaction1,
            });

            console.log(`✅ Updated Clause in both databases with ID: ${id}`);
          } else {
            // CREATE - New Clause
            console.log(`🔄 Creating new Clause...`);

            // Create in DB1 (auto-increment ID)
            clause1 = await this.Model1.create(clauseData, {
              transaction: transaction1,
            });
            clauseId = clause1.id;

            console.log(`✅ Created Clause in DB1 with ID: ${clauseId}`);

            // Create in DB2 with same ID
            const clauseDataWithId = {
              ...clauseData,
              id: clauseId,
            };
            await this.Model2.create(clauseDataWithId, {
              transaction: transaction2,
            });

            console.log(`✅ Created Clause in DB2 with ID: ${clauseId}`);
          }

          // Prepare clause points data with foreign key
          const clausePointsData = clause_points.map((point) => ({
            ...point,
            id_clause: clauseId,
          }));

          // Sync Clause Points (Create/Update/Delete)
          const clausePointsResult = await syncChildRecords({
            Model1: models.db1.ClausePoint,
            Model2: models.db2.ClausePoint,
            foreignKey: "id_clause",
            parentId: clauseId,
            newData: clausePointsData,
            transaction1,
            transaction2,
            isDoubleDatabase,
          });

          results.push({
            clause: clause1.toJSON(),
            clause_points: clausePointsResult,
            operation: isUpdate ? "updated" : "created",
          });
        }

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(
          `✅ ${clauseDataList.length} Clause records with clause points successfully processed`
        );

        return results;
      } else {
        // Single database (DB2 only)
        transaction1 = await db1.transaction();

        const results = [];

        for (const item of clauseDataList) {
          const { id, clause_points = [], ...clauseData } = item;

          let clauseId;
          let clause;
          let isUpdate = false;

          if (id) {
            // UPDATE
            isUpdate = true;
            clauseId = id;

            const [updatedRows] = await this.Model1.update(clauseData, {
              where: { id },
              transaction: transaction1,
            });

            if (updatedRows === 0) {
              throw new Error(`Clause with ID ${id} not found`);
            }

            clause = await this.Model1.findByPk(id, {
              transaction: transaction1,
            });
          } else {
            // CREATE
            clause = await this.Model1.create(clauseData, {
              transaction: transaction1,
            });
            clauseId = clause.id;
          }

          const clausePointsData = clause_points.map((point) => ({
            ...point,
            id_clause: clauseId,
          }));

          const clausePointsResult = await syncChildRecords({
            Model1: models.db1.ClausePoint,
            Model2: null,
            foreignKey: "id_clause",
            parentId: clauseId,
            newData: clausePointsData,
            transaction1,
            transaction2: null,
            isDoubleDatabase: false,
          });

          results.push({
            clause: clause.toJSON(),
            clause_points: clausePointsResult,
            operation: isUpdate ? "updated" : "created",
          });
        }

        await transaction1.commit();
        console.log(
          `✅ ${clauseDataList.length} Clause records processed in DB1 only`
        );

        return results;
      }
    } catch (error) {
      console.error(
        `❌ Error processing Clause with clause points:`,
        error.message
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(
        `Failed to process Clause with clause points: ${error.message}`
      );
    }
  }

  /**
   * Delete clause (will cascade to clause points based on DB constraints)
   * @param {Number} id - Clause ID
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Delete operation result
   */
  async deleteClause(id, isDoubleDatabase = true) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Deleting Clause ID ${id} from both databases...`);

        // Delete from DB1
        const deleted1 = await this.Model1.destroy({
          where: { id },
          transaction: transaction1,
        });

        // Delete from DB2
        const deleted2 = await this.Model2.destroy({
          where: { id },
          transaction: transaction2,
        });

        if (deleted1 === 0 && deleted2 === 0) {
          throw new Error(`Clause with ID ${id} not found`);
        }

        await transaction1.commit();
        await transaction2.commit();

        console.log(`✅ Clause ID ${id} deleted from both databases`);

        return {
          deleted: true,
          message: `Clause ID ${id} and related clause points deleted successfully`,
        };
      } else {
        transaction1 = await db1.transaction();

        const deleted = await this.Model1.destroy({
          where: { id },
          transaction: transaction1,
        });

        if (deleted === 0) {
          throw new Error(`Clause with ID ${id} not found`);
        }

        await transaction1.commit();

        console.log(`✅ Clause ID ${id} deleted from DB1`);

        return {
          deleted: true,
          message: `Clause ID ${id} and related clause points deleted successfully`,
        };
      }
    } catch (error) {
      console.error(`❌ Error deleting Clause:`, error.message);

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(`Failed to delete Clause: ${error.message}`);
    }
  }
}

module.exports = new ClauseService();
