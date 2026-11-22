// Master barang migration, on both databases. Safe to run more than once: every
// step checks the current schema/data first.
//   1. Creates the master_items table.
//   2. Adds id_master_item and model_number to purchase_request_items and
//      ga_purchase_order_items.
//   3. Moves the old serial_number values of those two tables into model_number
//      (they were typed as the item's model) and clears serial_number, so a rerun
//      never copies them again. The serial_number column itself is left in place,
//      unused, and can be dropped by hand later.
//   4. Adds id_master_item, product_code and model_number to inventories, with
//      indexes on product_code and (id_master_item, serial_number).
//   5. Adds has_serial_number to ga_purchase_order_item_receipts, creates
//      ga_purchase_order_item_receipt_units, and turns the unique index on
//      inventory_histories.id_ga_purchase_order_item_receipt into a plain one
//      (a receipt with serial numbers adds one history per unit).
//   6. Widens ga_purchase_order_item_receipts.type with "draft" (a goods receipt
//      saved before it is accepted or returned) and adds return_note.
//   7. Adds id_master_item, model_number and has_serial_number to
//      inventory_requests (moving the old serial_number into model_number, as in
//      step 3), creates inventory_request_units, and adds product_code and
//      model_number to inventory_opname_items.
//   8. Only with --clear-inventory-serial: clears serial_number of the inventory
//      rows without a master item (the old rows, whose serial_number was the
//      model typed in the purchase request). This cannot be undone; back up both
//      databases first. Rows with a master item are never touched.
//
// Usage: npm run db:sync-master-item [-- --clear-inventory-serial]
const { models, db1, db2 } = require("../src/models");

const itemModels = ["PurchaseRequestItem", "GaPurchaseOrderItem"];
const clearInventorySerial = process.argv.includes("--clear-inventory-serial");

async function addColumn(model, column) {
  const queryInterface = model.sequelize.getQueryInterface();
  const table = model.getTableName();
  const existing = await queryInterface.describeTable(table);
  if (existing[column]) return;
  // The foreign key is added separately with a short name: Sequelize's generated
  // name can exceed MySQL's 64-character identifier limit.
  const { references, ...definition } = model.rawAttributes[column];
  await queryInterface.addColumn(table, column, definition);
  if (references)
    await queryInterface.addConstraint(table, {
      type: "foreign key",
      name: `fk_${table}_${column}`.slice(0, 64),
      fields: [column],
      references: { table: references.model, field: references.key },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
  console.log(`  + ${table}.${column}`);
}

async function addIndex(model, fields) {
  const queryInterface = model.sequelize.getQueryInterface();
  const table = model.getTableName();
  const indexes = await queryInterface.showIndex(table);
  const same = (index) =>
    index.fields.length === fields.length &&
    index.fields.every((field, i) => field.attribute === fields[i]);
  if (indexes.some(same)) return;
  await queryInterface.addIndex(table, fields);
  console.log(`  + index ${table}(${fields.join(", ")})`);
}

async function moveSerialToModelNumber(model) {
  const table = model.getTableName();
  const existing = await model.sequelize.getQueryInterface().describeTable(table);
  if (!existing.serial_number) return;
  // MySQL assigns left to right, so model_number gets the old serial_number first.
  const [result] = await model.sequelize.query(`UPDATE ${table}
    SET model_number = serial_number, serial_number = NULL
    WHERE serial_number IS NOT NULL AND serial_number <> ''
      AND (model_number IS NULL OR model_number = '')`);
  console.log(`  ~ ${table}: ${result.affectedRows ?? 0} serial_number moved to model_number`);
}

async function addDraftReceiptType(model) {
  const queryInterface = model.sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable("ga_purchase_order_item_receipts");
  if (columns.type.type.toLowerCase().includes("'draft'")) return;
  const { type } = model.rawAttributes;
  await queryInterface.changeColumn("ga_purchase_order_item_receipts", "type", {
    type: type.type,
    allowNull: type.allowNull,
    comment: type.comment,
  });
  console.log("  ~ ga_purchase_order_item_receipts.type widened with draft");
}

// Plain index first, so the foreign key keeps an index while the unique one goes.
async function makeHistoryReceiptIndexPlain(model) {
  const queryInterface = model.sequelize.getQueryInterface();
  const column = "id_ga_purchase_order_item_receipt";
  const onlyColumn = (index) =>
    index.fields.length === 1 && index.fields[0].attribute === column;
  const indexes = await queryInterface.showIndex("inventory_histories");
  // Its own name: the old unique index already uses the generated one.
  if (!indexes.some((index) => !index.unique && onlyColumn(index))) {
    await queryInterface.addIndex("inventory_histories", [column], {
      name: "inventory_histories_receipt",
    });
    console.log(`  + index inventory_histories_receipt(${column})`);
  }
  for (const index of indexes)
    if (index.unique && onlyColumn(index)) {
      await queryInterface.removeIndex("inventory_histories", index.name);
      console.log(`  - unique index ${index.name}`);
    }
}

async function clearOldInventorySerials(model) {
  const [result] = await model.sequelize.query(`UPDATE inventories
    SET serial_number = NULL
    WHERE id_master_item IS NULL AND serial_number IS NOT NULL`);
  console.log(`  ~ inventories: ${result.affectedRows ?? 0} old serial_number cleared`);
}

const run = async () => {
  try {
    for (const [name, dbModels] of [["db1", models.db1], ["db2", models.db2]]) {
      console.log(`[${name}]`);
      await dbModels.MasterItem.sync({ alter: false });
      for (const modelName of itemModels) {
        await addColumn(dbModels[modelName], "id_master_item");
        await addColumn(dbModels[modelName], "model_number");
        await moveSerialToModelNumber(dbModels[modelName]);
      }
      for (const column of ["id_master_item", "product_code", "model_number"])
        await addColumn(dbModels.Inventory, column);
      await addIndex(dbModels.Inventory, ["product_code"]);
      await addIndex(dbModels.Inventory, ["id_master_item", "serial_number"]);
      await addColumn(dbModels.GaPurchaseOrderItemReceipt, "has_serial_number");
      await addColumn(dbModels.GaPurchaseOrderItemReceipt, "return_note");
      await addDraftReceiptType(dbModels.GaPurchaseOrderItemReceipt);
      await dbModels.GaPurchaseOrderItemReceiptUnit.sync({ alter: false });
      await makeHistoryReceiptIndexPlain(dbModels.InventoryHistory);
      for (const column of ["id_master_item", "model_number", "has_serial_number"])
        await addColumn(dbModels.InventoryRequest, column);
      await moveSerialToModelNumber(dbModels.InventoryRequest);
      await dbModels.InventoryRequestUnit.sync({ alter: false });
      for (const column of ["product_code", "model_number"])
        await addColumn(dbModels.InventoryOpnameItem, column);
      if (clearInventorySerial) await clearOldInventorySerials(dbModels.Inventory);
    }
    if (!clearInventorySerial)
      console.log("Old inventory serial_number kept; rerun with --clear-inventory-serial to clear it");
    console.log("Master item synchronized successfully");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
