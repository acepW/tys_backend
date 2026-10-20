const { DataTypes } = require("sequelize");

// One goods receipt per accept/return of a GA purchase order item. The good
// quantity goes into inventory; a return also records shipping the rest back.
module.exports = (sequelize) => {
  const GaPurchaseOrderItemReceipt = sequelize.define(
    "GaPurchaseOrderItemReceipt",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_ga_purchase_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "ga_purchase_orders", key: "id" },
      },
      id_ga_purchase_order_item: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "ga_purchase_order_items", key: "id" },
      },
      id_user: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      type: {
        type: DataTypes.ENUM("accept", "return"),
        allowNull: false,
      },
      quantity_received: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        comment: "Outstanding quantity checked in this receipt",
      },
      quantity_good: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        comment: "Good quantity, added to inventory for item_category item",
      },
      quantity_returned: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: "Quantity sent back to the vendor",
      },
      goods_in_date: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: "Date the goods came in (tanggal barang masuk)",
      },
      goods_status: {
        type: DataTypes.ENUM(
          "Good Without Exception",
          "Good With Notes",
          "Not Good",
        ),
        allowNull: false,
      },
      return_delivery_date: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Date the returned goods were shipped back (return only)",
      },
      return_shipping_cost: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        comment: "Cost of shipping the returned goods back (return only)",
      },
      note: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "ga_purchase_order_item_receipts",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["id_ga_purchase_order"] },
        { fields: ["id_ga_purchase_order_item"] },
      ],
    },
  );
  GaPurchaseOrderItemReceipt.associate = (models) => {
    GaPurchaseOrderItemReceipt.belongsTo(models.GaPurchaseOrder, {
      foreignKey: "id_ga_purchase_order",
      as: "ga_purchase_order",
    });
    GaPurchaseOrderItemReceipt.belongsTo(models.GaPurchaseOrderItem, {
      foreignKey: "id_ga_purchase_order_item",
      as: "ga_purchase_order_item",
    });
    GaPurchaseOrderItemReceipt.belongsTo(models.User, {
      foreignKey: "id_user",
      as: "user",
    });
    for (const category of [
      "files_goods_in",
      "files_goods_receipt",
      "files_return_delivery_proof",
      "files_return_waybill",
    ]) {
      GaPurchaseOrderItemReceipt.hasMany(models.File, {
        foreignKey: "fileable_id",
        constraints: false,
        scope: { fileable_type: "ga_purchase_order_item_receipts", category },
        as: category,
      });
    }
  };
  return GaPurchaseOrderItemReceipt;
};
