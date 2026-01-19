const { models } = require("../models");
const { db1, db2 } = require("../models");

/**
 * Base service class for dual database operations with rollback mechanism
 */
class DualDatabaseService {
  constructor(modelName) {
    this.modelName = modelName;
    this.Model1 = models.db1[modelName];
    this.Model2 = models.db2[modelName];
  }

  /**
   * Create record in dual database with transaction rollback
   * @param {Object} data - Data to create
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Object} Created record
   */
  async create(data, isDoubleDatabase = true) {
    let transaction1 = null;
    let transaction2 = null;
    let result1 = null;
    let result2 = null;

    try {
      if (isDoubleDatabase) {
        // Start transactions on both databases
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Creating ${this.modelName} in both databases...`);

        // Create in DB1 first to get the ID
        result1 = await this.Model1.create(data, { transaction: transaction1 });
        console.log(`✅ Created in DB1 with ID: ${result1.id}`);

        // Create in DB2 with the same ID
        const dataWithId = { ...data, id: result1.id };
        result2 = await this.Model2.create(dataWithId, {
          transaction: transaction2,
        });
        console.log(`✅ Created in DB2 with ID: ${result2.id}`);

        // Commit both transactions if successful
        await transaction1.commit();
        await transaction2.commit();
        console.log(
          `✅ ${this.modelName} successfully created in both databases`,
        );

        return result1.toJSON();
      } else {
        // Only create in DB2
        transaction2 = await db2.transaction();
        result2 = await this.Model2.create(data, { transaction: transaction2 });
        await transaction2.commit();

        console.log(
          `✅ Created ${this.modelName} in DB2 only with ID: ${result2.id}`,
        );
        return result2.toJSON();
      }
    } catch (error) {
      // Rollback transactions if any error occurs
      console.error(`❌ Error creating ${this.modelName}:`, error.message);

      if (transaction1) {
        await transaction1.rollback();
        console.log(`🔙 Rolled back transaction in DB1`);
      }

      if (transaction2) {
        await transaction2.rollback();
        console.log(`🔙 Rolled back transaction in DB2`);
      }

      throw new Error(`Failed to create ${this.modelName}: ${error.message}`);
    }
  }

  /**
   * Update record in dual database with transaction rollback
   * @param {Number} id - Record ID
   * @param {Object} data - Data to update
   * @param {Boolean} isDoubleDatabase - Update both databases if true
   * @returns {Object} Updated record
   */
  async update(id, data, isDoubleDatabase = true) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        // Start transactions on both databases
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Updating ${this.modelName} ID ${id} in both databases...`,
        );

        // Update in both databases
        const [updatedRows1] = await this.Model1.update(data, {
          where: { id },
          transaction: transaction1,
        });
        console.log(`✅ Updated ${updatedRows1} row(s) in DB1`);

        const [updatedRows2] = await this.Model2.update(data, {
          where: { id },
          transaction: transaction2,
        });
        console.log(`✅ Updated ${updatedRows2} row(s) in DB2`);

        // Check if update was successful in both databases
        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(
            `${this.modelName} with ID ${id} not found in either database`,
          );
        }

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(
          `✅ ${this.modelName} successfully updated in both databases`,
        );

        // Return updated record from DB1
        const updated = await this.Model1.findByPk(id);
        return updated ? updated.toJSON() : null;
      } else {
        // Only update in DB2
        transaction2 = await db2.transaction();

        const [updatedRows] = await this.Model2.update(data, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows === 0) {
          throw new Error(`${this.modelName} with ID ${id} not found`);
        }

        await transaction2.commit();
        console.log(`✅ Updated ${this.modelName} in DB2 only`);

        const updated = await this.Model2.findByPk(id);
        return updated ? updated.toJSON() : null;
      }
    } catch (error) {
      console.error(`❌ Error updating ${this.modelName}:`, error.message);

      // Rollback transactions
      if (transaction1) {
        await transaction1.rollback();
        console.log(`🔙 Rolled back transaction in DB1`);
      }

      if (transaction2) {
        await transaction2.rollback();
        console.log(`🔙 Rolled back transaction in DB2`);
      }

      throw new Error(`Failed to update ${this.modelName}: ${error.message}`);
    }
  }

  /**
   * Delete record from dual database with transaction rollback
   * @param {Number} id - Record ID
   * @param {Boolean} isDoubleDatabase - Delete from both databases if true
   * @returns {Boolean} Success status
   */
  async delete(id, isDoubleDatabase = true) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        // Start transactions on both databases
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Deleting ${this.modelName} ID ${id} from both databases...`,
        );

        // Delete from both databases
        const deleted1 = await this.Model1.destroy({
          where: { id },
          transaction: transaction1,
        });
        console.log(`✅ Deleted ${deleted1} row(s) from DB1`);

        const deleted2 = await this.Model2.destroy({
          where: { id },
          transaction: transaction2,
        });
        console.log(`✅ Deleted ${deleted2} row(s) from DB2`);

        // Check if deletion was successful
        if (deleted1 === 0 && deleted2 === 0) {
          throw new Error(
            `${this.modelName} with ID ${id} not found in either database`,
          );
        }

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(
          `✅ ${this.modelName} successfully deleted from both databases`,
        );

        return true;
      } else {
        // Only delete from DB2
        transaction2 = await db2.transaction();

        const deleted = await this.Model2.destroy({
          where: { id },
          transaction: transaction2,
        });

        if (deleted === 0) {
          throw new Error(`${this.modelName} with ID ${id} not found`);
        }

        await transaction2.commit();
        console.log(`✅ Deleted ${this.modelName} from DB2 only`);

        return true;
      }
    } catch (error) {
      console.error(`❌ Error deleting ${this.modelName}:`, error.message);

      // Rollback transactions
      if (transaction1) {
        await transaction1.rollback();
        console.log(`🔙 Rolled back transaction in DB1`);
      }

      if (transaction2) {
        await transaction2.rollback();
        console.log(`🔙 Rolled back transaction in DB2`);
      }

      throw new Error(`Failed to delete ${this.modelName}: ${error.message}`);
    }
  }

  /**
   * Bulk create with transaction rollback
   * @param {Array} dataArray - Array of data to create
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Array} Created records
   */
  async bulkCreate(dataArray, isDoubleDatabase = true) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Bulk creating ${dataArray.length} ${this.modelName}(s) in both databases...`,
        );

        // Bulk create in DB1
        const results1 = await this.Model1.bulkCreate(dataArray, {
          transaction: transaction1,
          returning: true,
        });
        console.log(`✅ Created ${results1.length} records in DB1`);

        // Prepare data with IDs for DB2
        const dataWithIds = results1.map((result, index) => ({
          ...dataArray[index],
          id: result.id,
        }));

        // Bulk create in DB2
        const results2 = await this.Model2.bulkCreate(dataWithIds, {
          transaction: transaction2,
          returning: true,
        });
        console.log(`✅ Created ${results2.length} records in DB2`);

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Bulk create successful in both databases`);

        return results1.map((r) => r.toJSON());
      } else {
        transaction2 = await db2.transaction();

        const results = await this.Model2.bulkCreate(dataArray, {
          transaction: transaction2,
          returning: true,
        });

        await transaction2.commit();
        console.log(`✅ Bulk created ${results.length} records in DB2 only`);

        return results.map((r) => r.toJSON());
      }
    } catch (error) {
      console.error(`❌ Error in bulk create:`, error.message);

      if (transaction1) {
        await transaction1.rollback();
        console.log(`🔙 Rolled back transaction in DB1`);
      }

      if (transaction2) {
        await transaction2.rollback();
        console.log(`🔙 Rolled back transaction in DB2`);
      }

      throw new Error(
        `Failed to bulk create ${this.modelName}: ${error.message}`,
      );
    }
  }

  /**
   * Get all records (no transaction needed for read operations)
   */
  async findAll(options = {}, isDoubleDatabase = true) {
    try {
      const Model = isDoubleDatabase ? this.Model1 : this.Model2;
      const dbName = isDoubleDatabase ? "DB1" : "DB2";

      const results = await Model.findAll(options);
      console.log(
        `✅ Found ${results.length} ${this.modelName}(s) from ${dbName}`,
      );

      return results.map((r) => r.toJSON());
    } catch (error) {
      console.error(`❌ Error finding ${this.modelName}:`, error.message);
      throw new Error(`Error finding ${this.modelName}: ${error.message}`);
    }
  }

  /**
   * Get single record by ID (no transaction needed for read operations)
   */
  async findById(id, options = {}, isDoubleDatabase = true) {
    try {
      const Model = isDoubleDatabase ? this.Model1 : this.Model2;
      const dbName = isDoubleDatabase ? "DB1" : "DB2";

      const result = await Model.findByPk(id, options);

      if (result) {
        console.log(`✅ Found ${this.modelName} with ID ${id} from ${dbName}`);
        return result.toJSON();
      } else {
        console.log(
          `⚠️ ${this.modelName} with ID ${id} not found in ${dbName}`,
        );
        return null;
      }
    } catch (error) {
      console.error(`❌ Error finding ${this.modelName} by ID:`, error.message);
      throw new Error(
        `Error finding ${this.modelName} by ID: ${error.message}`,
      );
    }
  }

  /**
   * Find one record (no transaction needed for read operations)
   */
  async findOne(options = {}, isDoubleDatabase = true) {
    try {
      const Model = isDoubleDatabase ? this.Model1 : this.Model2;
      const result = await Model.findOne(options);
      return result ? result.toJSON() : null;
    } catch (error) {
      console.error(`❌ Error finding one ${this.modelName}:`, error.message);
      throw new Error(`Error finding one ${this.modelName}: ${error.message}`);
    }
  }

  /**
   * Count records (no transaction needed for read operations)
   */
  async count(options = {}, isDoubleDatabase = true) {
    try {
      const Model = isDoubleDatabase ? this.Model1 : this.Model2;
      const count = await Model.count(options);
      return count;
    } catch (error) {
      console.error(`❌ Error counting ${this.modelName}:`, error.message);
      throw new Error(`Error counting ${this.modelName}: ${error.message}`);
    }
  }
}

module.exports = DualDatabaseService;
