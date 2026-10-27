// Creates the inventory opname tables, links inventory_histories to them and adds
// new opname item columns; purchase_request_category of existing items is filled
// from their inventory row. Safe to run more than once: existing tables and
// columns are left untouched.
const { models, db1, db2 } = require("../src/models");

async function addMissingColumns(model) {
  const queryInterface = model.sequelize.getQueryInterface();
  const table = model.getTableName();
  const existing = await queryInterface.describeTable(table);
  for (const attribute of Object.values(model.rawAttributes)) {
    if (existing[attribute.field]) continue;
    // Foreign keys get a short explicit name: Sequelize's generated one can exceed
    // MySQL's 64-character identifier limit.
    const { references, ...definition } = attribute;
    await queryInterface.addColumn(table, attribute.field, definition);
    if (references)
      await queryInterface.addConstraint(table, {
        type: "foreign key",
        name: `fk_${table}_${attribute.field}`.slice(0, 64),
        fields: [attribute.field],
        references: { table: references.model, field: references.key },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      });
    console.log(`  + ${table}.${attribute.field}`);
  }
}

const run = async () => {
  try {
    for (const [name, dbModels] of [["db1", models.db1], ["db2", models.db2]]) {
      console.log(`[${name}]`);
      for (const modelName of [
        "InventoryOpname",
        "InventoryOpnameItem",
        "InventoryOpnameItemDetail",
        "InventoryOpnameVerificationProgress",
      ])
        await dbModels[modelName].sync({ alter: false });
      await addMissingColumns(dbModels.InventoryHistory);
      await addMissingColumns(dbModels.InventoryOpnameItem);
      const [result] = await dbModels.InventoryOpnameItem.sequelize.query(`
        UPDATE inventory_opname_items i JOIN inventories v ON v.id = i.id_inventory
        SET i.purchase_request_category = v.purchase_request_category
        WHERE i.purchase_request_category IS NULL AND v.purchase_request_category IS NOT NULL`);
      console.log(`  ~ opname items purchase_request_category filled: ${result.affectedRows}`);
    }
    console.log("Inventory opname tables synchronized successfully");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
