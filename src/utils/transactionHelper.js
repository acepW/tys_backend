const { db1, db2 } = require("../models");

/**
 * Sync child records with parent in a transaction
 * Handles create, update, and delete operations
 *
 * @param {Object} options
 * @param {Object} options.Model1 - Sequelize model for DB1
 * @param {Object} options.Model2 - Sequelize model for DB2
 * @param {String} options.foreignKey - Foreign key field name (e.g., 'id_product')
 * @param {Number} options.parentId - Parent record ID
 * @param {Array} options.newData - New data array from request
 * @param {Object} options.transaction1 - Transaction for DB1
 * @param {Object} options.transaction2 - Transaction for DB2
 * @param {Boolean} options.isDoubleDatabase - Whether to sync both databases
 * @returns {Object} Result with created, updated, and deleted records
 */
async function syncChildRecords({
  Model1,
  Model2,
  foreignKey,
  parentId,
  newData = [],
  transaction1,
  transaction2,
  isDoubleDatabase = true,
}) {
  try {
    const result = {
      created: [],
      updated: [],
      deleted: [],
      summary: {
        totalCreated: 0,
        totalUpdated: 0,
        totalDeleted: 0,
      },
    };

    if (isDoubleDatabase) {
      // 1. Get existing records from DB1
      const existingRecords = await Model1.findAll({
        where: { [foreignKey]: parentId },
        transaction: transaction1,
      });

      const existingIds = existingRecords.map((r) => r.id);
      const newIds = newData.filter((d) => d.id).map((d) => d.id);

      // 2. Determine which IDs to DELETE (exists in DB but not in new data)
      const idsToDelete = existingIds.filter((id) => !newIds.includes(id));

      // 3. Separate CREATE and UPDATE
      const toCreate = newData.filter((d) => !d.id || d.id === null);
      const toUpdate = newData.filter((d) => d.id && d.id !== null);

      console.log(`🔄 Sync operation for ${foreignKey}=${parentId}:`);
      console.log(`   - To Create: ${toCreate.length}`);
      console.log(`   - To Update: ${toUpdate.length}`);
      console.log(`   - To Delete: ${idsToDelete.length}`);

      // 4. DELETE operations
      if (idsToDelete.length > 0) {
        const deleted1 = await Model1.destroy({
          where: {
            id: idsToDelete,
            [foreignKey]: parentId, // Extra safety
          },
          transaction: transaction1,
        });

        const deleted2 = await Model2.destroy({
          where: {
            id: idsToDelete,
            [foreignKey]: parentId,
          },
          transaction: transaction2,
        });

        console.log(`✅ Deleted ${deleted1} records from DB1`);
        console.log(`✅ Deleted ${deleted2} records from DB2`);

        result.deleted = idsToDelete;
        result.summary.totalDeleted = idsToDelete.length;
      }

      // 5. CREATE operations
      if (toCreate.length > 0) {
        // Add foreign key to all records
        const dataWithForeignKey = toCreate.map((item) => ({
          ...item,
          [foreignKey]: parentId,
        }));

        // Create in DB1 first to get IDs
        const created1 = await Model1.bulkCreate(dataWithForeignKey, {
          transaction: transaction1,
          returning: true,
        });

        // Create in DB2 with same IDs
        const dataWithIds = created1.map((record, index) => ({
          ...dataWithForeignKey[index],
          id: record.id,
        }));

        await Model2.bulkCreate(dataWithIds, {
          transaction: transaction2,
        });

        console.log(`✅ Created ${created1.length} records in both databases`);

        result.created = created1.map((r) => r.toJSON());
        result.summary.totalCreated = created1.length;
      }

      // 6. UPDATE operations
      if (toUpdate.length > 0) {
        const updatedRecords = [];

        for (const item of toUpdate) {
          const { id, ...updateData } = item;

          // Ensure foreign key is set
          updateData[foreignKey] = parentId;

          // Update in DB1
          await Model1.update(updateData, {
            where: { id, [foreignKey]: parentId }, // Extra safety
            transaction: transaction1,
          });

          // Update in DB2
          await Model2.update(updateData, {
            where: { id, [foreignKey]: parentId },
            transaction: transaction2,
          });

          // Fetch updated record
          const updated = await Model1.findByPk(id, {
            transaction: transaction1,
          });

          if (updated) {
            updatedRecords.push(updated.toJSON());
          }
        }

        console.log(`✅ Updated ${toUpdate.length} records in both databases`);

        result.updated = updatedRecords;
        result.summary.totalUpdated = toUpdate.length;
      }
    } else {
      // Single database (DB2 only)
      const existingRecords = await Model2.findAll({
        where: { [foreignKey]: parentId },
        transaction: transaction2,
      });

      const existingIds = existingRecords.map((r) => r.id);
      const newIds = newData.filter((d) => d.id).map((d) => d.id);
      const idsToDelete = existingIds.filter((id) => !newIds.includes(id));

      const toCreate = newData.filter((d) => !d.id || d.id === null);
      const toUpdate = newData.filter((d) => d.id && d.id !== null);

      // DELETE
      if (idsToDelete.length > 0) {
        await Model2.destroy({
          where: {
            id: idsToDelete,
            [foreignKey]: parentId,
          },
          transaction: transaction2,
        });

        result.deleted = idsToDelete;
        result.summary.totalDeleted = idsToDelete.length;
      }

      // CREATE
      if (toCreate.length > 0) {
        const dataWithForeignKey = toCreate.map((item) => ({
          ...item,
          [foreignKey]: parentId,
        }));

        const created = await Model2.bulkCreate(dataWithForeignKey, {
          transaction: transaction2,
          returning: true,
        });

        result.created = created.map((r) => r.toJSON());
        result.summary.totalCreated = created.length;
      }

      // UPDATE
      if (toUpdate.length > 0) {
        const updatedRecords = [];

        for (const item of toUpdate) {
          const { id, ...updateData } = item;
          updateData[foreignKey] = parentId;

          await Model2.update(updateData, {
            where: { id, [foreignKey]: parentId },
            transaction: transaction2,
          });

          const updated = await Model2.findByPk(id, {
            transaction: transaction2,
          });

          if (updated) {
            updatedRecords.push(updated.toJSON());
          }
        }

        result.updated = updatedRecords;
        result.summary.totalUpdated = toUpdate.length;
      }

      console.log(`✅ Sync completed in DB2 only`);
    }

    return result;
  } catch (error) {
    console.error(`❌ Error in syncChildRecords:`, error.message);
    throw error;
  }
}

module.exports = {
  syncChildRecords,
};
