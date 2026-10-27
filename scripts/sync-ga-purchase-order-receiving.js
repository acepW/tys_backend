// Migrates GA purchase orders to per-item realization, goods receipts and refunds.
// Safe to run more than once: every step checks the current schema/data first.
//   1. Creates ga_purchase_order_item_receipts and ga_purchase_order_item_realizations.
//   2. Adds missing columns (order totals, item quantities/refund, inventory history receipt link).
//   3. Widens ga_purchase_order_items.receiving_status with "refund requested" and "refunded",
//      and merges receipt goods_status "Not Good Refund" / "Not Good Returned" into "Not Good".
//   4. Lets inventory_histories hold several rows per order item (one per receipt).
//   5. Backfills order totals, item quantities, one receipt per item accepted the old way
//      and one realization per item that saved it on the item columns.
const { DataTypes } = require("sequelize");
const { models, db1, db2 } = require("../src/models");

async function addMissingColumns(dbModels, modelName) {
  const model = dbModels[modelName];
  const queryInterface = model.sequelize.getQueryInterface();
  const table = model.getTableName();
  const existing = await queryInterface.describeTable(table);
  for (const attribute of Object.values(model.rawAttributes)) {
    if (existing[attribute.field]) continue;
    // Unique indexes and foreign keys are added separately: Sequelize's generated
    // foreign key name can exceed MySQL's 64-character identifier limit.
    const { unique, references, ...definition } = attribute;
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

async function migrateSchema(name, dbModels) {
  console.log(`[${name}] schema`);
  await dbModels.GaPurchaseOrderItemReceipt.sync({ alter: false });
  await dbModels.GaPurchaseOrderItemRealization.sync({ alter: false });
  for (const modelName of ["GaPurchaseOrder", "GaPurchaseOrderItem", "InventoryHistory"])
    await addMissingColumns(dbModels, modelName);

  const queryInterface = dbModels.GaPurchaseOrderItem.sequelize.getQueryInterface();
  const { receiving_status: status } = dbModels.GaPurchaseOrderItem.rawAttributes;
  await queryInterface.changeColumn("ga_purchase_order_items", "receiving_status", {
    type: status.type,
    allowNull: status.allowNull,
    defaultValue: status.defaultValue,
    comment: status.comment,
  });

  // "Not Good Refund" and "Not Good Returned" were merged into "Not Good".
  const receiptColumns = await queryInterface.describeTable("ga_purchase_order_item_receipts");
  if (receiptColumns.goods_status.type.toUpperCase().includes("NOT GOOD RE")) {
    const { goods_status: goodsStatus } = dbModels.GaPurchaseOrderItemReceipt.rawAttributes;
    const column = (values) => ({ type: DataTypes.ENUM(...values), allowNull: goodsStatus.allowNull });
    await queryInterface.changeColumn("ga_purchase_order_item_receipts", "goods_status",
      column([...goodsStatus.values, "Not Good Refund", "Not Good Returned"]));
    await dbModels.GaPurchaseOrderItemReceipt.sequelize.query(`UPDATE ga_purchase_order_item_receipts
      SET goods_status = 'Not Good' WHERE goods_status IN ('Not Good Refund', 'Not Good Returned')`);
    await queryInterface.changeColumn("ga_purchase_order_item_receipts", "goods_status",
      column(goodsStatus.values));
    console.log("  ~ ga_purchase_order_item_receipts.goods_status merged into Not Good");
  }

  // The receipt link is unique; the item link no longer is. Add the plain index
  // first so the foreign key keeps an index while the unique one is dropped.
  const indexes = await queryInterface.showIndex("inventory_histories");
  const onlyColumn = (index, column) =>
    index.fields.length === 1 && index.fields[0].attribute === column;
  if (!indexes.some((index) => !index.unique && onlyColumn(index, "id_ga_purchase_order_item")))
    await queryInterface.addIndex("inventory_histories", ["id_ga_purchase_order_item"]);
  for (const index of indexes)
    if (index.unique && onlyColumn(index, "id_ga_purchase_order_item")) {
      await queryInterface.removeIndex("inventory_histories", index.name);
      console.log(`  - unique index ${index.name}`);
    }
  if (!indexes.some((index) => index.unique && onlyColumn(index, "id_ga_purchase_order_item_receipt")))
    await queryInterface.addIndex("inventory_histories", ["id_ga_purchase_order_item_receipt"], {
      unique: true,
    });
}

async function backfillTotals(name, sequelize) {
  const [result] = await sequelize.query(`
    UPDATE ga_purchase_orders o
    JOIN (
      SELECT id_ga_purchase_order, SUM(sub_total) sub_total, SUM(ppn) ppn, SUM(pph) pph,
        SUM(pp_20) pp_20, SUM(pph_4_ayat_2) pph_4_ayat_2, SUM(total) total
      FROM ga_purchase_order_items GROUP BY id_ga_purchase_order
    ) i ON i.id_ga_purchase_order = o.id
    SET o.sub_total = i.sub_total, o.ppn = i.ppn, o.pph = i.pph, o.pp_20 = i.pp_20,
      o.pph_4_ayat_2 = i.pph_4_ayat_2, o.total = i.total`);
  console.log(`[${name}] order totals updated: ${result.affectedRows}`);
  await sequelize.query(`UPDATE ga_purchase_order_items SET quantity_good = quantity
    WHERE receiving_status = 'accepted' AND quantity_good = 0`);
  // Old-style returns sent the whole item back.
  await sequelize.query(`UPDATE ga_purchase_order_items SET quantity_returned = quantity
    WHERE receiving_status = 'returned' AND quantity_good = 0 AND quantity_returned = 0`);
}

// Items accepted before receipts existed get one accept receipt built from the
// old item columns; their goods files and inventory history move to it.
async function backfillReceipts() {
  const columns = await db1.getQueryInterface().describeTable("ga_purchase_order_items");
  if (!columns.goods_in_date || !columns.goods_status) return;
  const [items] = await db1.query(`
    SELECT i.id, i.id_ga_purchase_order, i.quantity, i.goods_in_date, i.goods_status,
      i.receiving_note, i.updated_at,
      (SELECT p.id_user FROM ga_purchase_order_verification_progress p
        WHERE p.id_ga_purchase_order_item = i.id AND p.status = 'goods accepted'
        ORDER BY p.id DESC LIMIT 1) id_user,
      o.id_user_request
    FROM ga_purchase_order_items i
    JOIN ga_purchase_orders o ON o.id = i.id_ga_purchase_order
    LEFT JOIN ga_purchase_order_item_receipts r ON r.id_ga_purchase_order_item = i.id
    WHERE i.receiving_status = 'accepted' AND i.goods_in_date IS NOT NULL
      AND i.goods_status IS NOT NULL AND r.id IS NULL`);
  for (const item of items) {
    const t1 = await db1.transaction();
    const t2 = await db2.transaction();
    try {
      const data = {
        id_ga_purchase_order: item.id_ga_purchase_order,
        id_ga_purchase_order_item: item.id,
        id_user: item.id_user ?? item.id_user_request,
        type: "accept",
        quantity_received: item.quantity,
        quantity_good: item.quantity,
        quantity_returned: 0,
        goods_in_date: item.goods_in_date,
        goods_status: item.goods_status,
        note: item.receiving_note,
      };
      const receipt = await models.db1.GaPurchaseOrderItemReceipt.create(data, { transaction: t1 });
      const targets = [[models.db1, t1]];
      if (await models.db2.GaPurchaseOrderItem.findByPk(item.id, { transaction: t2 })) {
        await models.db2.GaPurchaseOrderItemReceipt.create({ ...data, id: receipt.id }, { transaction: t2 });
        targets.push([models.db2, t2]);
      }
      for (const [dbModels, t] of targets) {
        await dbModels.File.update(
          { fileable_type: "ga_purchase_order_item_receipts", fileable_id: receipt.id },
          {
            where: {
              fileable_type: "ga_purchase_order_items",
              fileable_id: item.id,
              category: ["files_goods_in", "files_goods_receipt"],
            },
            transaction: t,
          },
        );
        await dbModels.InventoryHistory.update(
          { id_ga_purchase_order_item_receipt: receipt.id },
          {
            where: { id_ga_purchase_order_item: item.id, id_ga_purchase_order_item_receipt: null },
            transaction: t,
          },
        );
      }
      await t1.commit();
      await t2.commit();
    } catch (error) {
      await t1.rollback();
      await t2.rollback();
      throw error;
    }
  }
  console.log(`[db1/db2] receipts backfilled: ${items.length}`);
}

// Realizations saved on the old item columns become the item's first realization
// row; their purchase proof and invoice files move to it.
async function backfillRealizations() {
  const columns = await db1.getQueryInterface().describeTable("ga_purchase_order_items");
  if (!columns.purchase_realization_date) return;
  const [items] = await db1.query(`
    SELECT i.id, i.id_ga_purchase_order, i.purchase_realization_date,
      i.purchase_realization_amount, i.purchase_realization_note,
      (SELECT p.id_user FROM ga_purchase_order_verification_progress p
        WHERE p.id_ga_purchase_order_item = i.id
          AND p.status IN ('purchase realization saved', 'purchase realization updated')
        ORDER BY p.id DESC LIMIT 1) id_user,
      o.id_user_request
    FROM ga_purchase_order_items i
    JOIN ga_purchase_orders o ON o.id = i.id_ga_purchase_order
    LEFT JOIN ga_purchase_order_item_realizations r ON r.id_ga_purchase_order_item = i.id
    WHERE i.purchase_realization_date IS NOT NULL AND r.id IS NULL`);
  for (const item of items) {
    const t1 = await db1.transaction();
    const t2 = await db2.transaction();
    try {
      const data = {
        id_ga_purchase_order: item.id_ga_purchase_order,
        id_ga_purchase_order_item: item.id,
        id_user: item.id_user ?? item.id_user_request,
        purchase_realization_date: item.purchase_realization_date,
        purchase_realization_amount: item.purchase_realization_amount ?? 0,
        note: item.purchase_realization_note,
      };
      const realization = await models.db1.GaPurchaseOrderItemRealization.create(data, { transaction: t1 });
      const targets = [[models.db1, t1]];
      if (await models.db2.GaPurchaseOrderItem.findByPk(item.id, { transaction: t2 })) {
        await models.db2.GaPurchaseOrderItemRealization.create({ ...data, id: realization.id }, { transaction: t2 });
        targets.push([models.db2, t2]);
      }
      for (const [dbModels, t] of targets)
        await dbModels.File.update(
          { fileable_type: "ga_purchase_order_item_realizations", fileable_id: realization.id },
          {
            where: {
              fileable_type: "ga_purchase_order_items",
              fileable_id: item.id,
              category: ["files_purchase_proof", "files_invoice"],
            },
            transaction: t,
          },
        );
      await t1.commit();
      await t2.commit();
    } catch (error) {
      await t1.rollback();
      await t2.rollback();
      throw error;
    }
  }
  console.log(`[db1/db2] realizations backfilled: ${items.length}`);
}

const run = async () => {
  try {
    for (const [name, dbModels] of [["db1", models.db1], ["db2", models.db2]])
      await migrateSchema(name, dbModels);
    for (const [name, sequelize] of [["db1", db1], ["db2", db2]])
      await backfillTotals(name, sequelize);
    await backfillReceipts();
    await backfillRealizations();
    console.log("GA purchase order receiving migration finished");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
