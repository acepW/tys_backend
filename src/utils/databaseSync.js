const { models, db1, db2 } = require("../models");

/**
 * Check if databases are in sync
 * @param {String} modelName - Model name to check
 * @returns {Object} Sync status
 */
async function checkDatabaseSync(modelName) {
  try {
    const Model1 = models.db1[modelName];
    const Model2 = models.db2[modelName];

    // Get all records from both databases
    const records1 = await Model1.findAll({ raw: true });
    const records2 = await Model2.findAll({ raw: true });

    // Compare counts
    const count1 = records1.length;
    const count2 = records2.length;

    console.log(`\n🔍 Checking ${modelName} sync status:`);
    console.log(`   DB1: ${count1} records`);
    console.log(`   DB2: ${count2} records`);

    // Find differences
    const ids1 = new Set(records1.map((r) => r.id));
    const ids2 = new Set(records2.map((r) => r.id));

    const onlyInDb1 = records1.filter((r) => !ids2.has(r.id));
    const onlyInDb2 = records2.filter((r) => !ids1.has(r.id));

    const isSync =
      count1 === count2 && onlyInDb1.length === 0 && onlyInDb2.length === 0;

    return {
      modelName,
      isSync,
      db1Count: count1,
      db2Count: count2,
      onlyInDb1,
      onlyInDb2,
      differences: {
        onlyInDb1Count: onlyInDb1.length,
        onlyInDb2Count: onlyInDb2.length,
      },
    };
  } catch (error) {
    console.error(`❌ Error checking sync for ${modelName}:`, error.message);
    throw error;
  }
}

/**
 * Check all models sync status
 * @returns {Array} Array of sync statuses
 */
async function checkAllDatabasesSync() {
  const modelNames = [
    "Category",
    "SubCategory",
    "Company",
    "Product",
    "Customer",
  ];
  const results = [];

  console.log("\n📊 Checking all databases sync status...\n");

  for (const modelName of modelNames) {
    const result = await checkDatabaseSync(modelName);
    results.push(result);

    if (!result.isSync) {
      console.log(`⚠️ ${modelName} is NOT in sync!`);
      if (result.onlyInDb1.length > 0) {
        console.log(`   - ${result.onlyInDb1.length} records only in DB1`);
      }
      if (result.onlyInDb2.length > 0) {
        console.log(`   - ${result.onlyInDb2.length} records only in DB2`);
      }
    } else {
      console.log(`✅ ${modelName} is in sync`);
    }
  }

  return results;
}

/**
 * Sync specific record from DB1 to DB2
 * @param {String} modelName - Model name
 * @param {Number} id - Record ID
 */
async function syncRecordToDb2(modelName, id) {
  const transaction = await db2.transaction();

  try {
    const Model1 = models.db1[modelName];
    const Model2 = models.db2[modelName];

    // Get record from DB1
    const record = await Model1.findByPk(id, { raw: true });

    if (!record) {
      throw new Error(`Record with ID ${id} not found in DB1`);
    }

    // Check if exists in DB2
    const existingInDb2 = await Model2.findByPk(id);

    if (existingInDb2) {
      // Update existing record
      await Model2.update(record, {
        where: { id },
        transaction,
      });
      console.log(`✅ Updated ${modelName} ID ${id} in DB2`);
    } else {
      // Create new record
      await Model2.create(record, { transaction });
      console.log(`✅ Created ${modelName} ID ${id} in DB2`);
    }

    await transaction.commit();
    return true;
  } catch (error) {
    await transaction.rollback();
    console.error(`❌ Error syncing ${modelName} ID ${id}:`, error.message);
    throw error;
  }
}

/**
 * Sync all records of a model from DB1 to DB2
 * @param {String} modelName - Model name
 */
async function syncAllRecordsToDb2(modelName) {
  try {
    const Model1 = models.db1[modelName];
    const records = await Model1.findAll({ raw: true });

    console.log(
      `\n🔄 Syncing ${records.length} ${modelName} records to DB2...`,
    );

    let synced = 0;
    let failed = 0;

    for (const record of records) {
      try {
        await syncRecordToDb2(modelName, record.id);
        synced++;
      } catch (error) {
        failed++;
        console.error(`Failed to sync ID ${record.id}`);
      }
    }

    console.log(`\n✅ Sync complete: ${synced} succeeded, ${failed} failed`);

    return { synced, failed };
  } catch (error) {
    console.error(`❌ Error syncing all ${modelName}:`, error.message);
    throw error;
  }
}

module.exports = {
  checkDatabaseSync,
  checkAllDatabasesSync,
  syncRecordToDb2,
  syncAllRecordsToDb2,
};
