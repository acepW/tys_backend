// Creates the inventory_movements and inventory_movement_verification_progress
// tables, links inventory_histories to movements and adds
// inventories.movement_status (NULL for rows never moved).
// Run npm run db:sync-inventory-location first (movements reference locations).
// Safe to run more than once: existing tables and columns are left untouched.
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
      await dbModels.InventoryMovement.sync({ alter: false });
      await dbModels.InventoryMovementVerificationProgress.sync({ alter: false });
      await addColumn(dbModels.InventoryHistory, "id_inventory_movement");
      await addColumn(dbModels.Inventory, "movement_status");
    }
    console.log("Inventory movement synchronized successfully");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
