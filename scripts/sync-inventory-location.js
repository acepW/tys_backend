// Creates the inventory_locations master and adds id_inventory_location to
// companies, plus id_company and id_inventory_location to inventories,
// inventory_requests and inventory_opnames.
// Safe to run more than once: existing tables and columns are left untouched.
// Rows created before this keep both columns NULL, so they no longer match new
// stock; fill them in (or set each company's default location) before receiving.
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
      await dbModels.InventoryLocation.sync({ alter: false });
      await addColumn(dbModels.Company, "id_inventory_location");
      for (const model of [
        dbModels.Inventory,
        dbModels.InventoryRequest,
        dbModels.InventoryOpname,
      ]) {
        await addColumn(model, "id_company");
        await addColumn(model, "id_inventory_location");
      }
    }
    console.log("Inventory location synchronized successfully");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
