// Adds received_date (tanggal penerimaan) to inventories, inventory_requests and
// inventory_histories.
// Safe to run more than once: existing columns are left untouched. Rows created
// before this keep received_date NULL.
const { models, db1, db2 } = require("../src/models");

async function addColumn(model, column) {
  const queryInterface = model.sequelize.getQueryInterface();
  const table = model.getTableName();
  const existing = await queryInterface.describeTable(table);
  if (existing[column]) return;
  await queryInterface.addColumn(table, column, model.rawAttributes[column]);
  console.log(`  + ${table}.${column}`);
}

const run = async () => {
  try {
    for (const [name, dbModels] of [["db1", models.db1], ["db2", models.db2]]) {
      console.log(`[${name}]`);
      await addColumn(dbModels.Inventory, "received_date");
      await addColumn(dbModels.InventoryRequest, "received_date");
      await addColumn(dbModels.InventoryHistory, "received_date");
    }
    console.log("Inventory received_date synchronized successfully");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
