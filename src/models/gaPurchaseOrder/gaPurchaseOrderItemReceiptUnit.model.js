const { DataTypes } = require("sequelize");

// One unit of a goods receipt saved with serial numbers (has_serial_number). Each
// unit that goes into inventory becomes its own inventory row (quantity 1) with
// its own product code; id_inventory points at it.
module.exports = (sequelize) => {
  const GaPurchaseOrderItemReceiptUnit = sequelize.define(
    "GaPurchaseOrderItemReceiptUnit",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_ga_purchase_order_item_receipt: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "ga_purchase_order_item_receipts", key: "id" },
      },
      id_ga_purchase_order_item: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "ga_purchase_order_items", key: "id" },
      },
      serial_number: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "Serial number (no seri) of the unit",
      },
      is_returned: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Unit picked to be shipped back to the vendor; it never goes into inventory",
      },
      id_inventory: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "inventories", key: "id" },
        comment: "Inventory row the unit went into; NULL until stocked or when returned",
      },
    },
    {
      tableName: "ga_purchase_order_item_receipt_units",
      timestamps: true,
      underscored: true,
      // Named explicitly: the generated names exceed MySQL's 64-character limit.
      indexes: [
        { name: "ga_po_receipt_units_receipt", fields: ["id_ga_purchase_order_item_receipt"] },
        { name: "ga_po_receipt_units_item", fields: ["id_ga_purchase_order_item"] },
        { name: "ga_po_receipt_units_serial_number", fields: ["serial_number"] },
      ],
    },
  );
  GaPurchaseOrderItemReceiptUnit.associate = (models) => {
    GaPurchaseOrderItemReceiptUnit.belongsTo(models.GaPurchaseOrderItemReceipt, {
      foreignKey: "id_ga_purchase_order_item_receipt",
      as: "receipt",
    });
    GaPurchaseOrderItemReceiptUnit.belongsTo(models.GaPurchaseOrderItem, {
      foreignKey: "id_ga_purchase_order_item",
      as: "ga_purchase_order_item",
    });
    GaPurchaseOrderItemReceiptUnit.belongsTo(models.Inventory, {
      foreignKey: "id_inventory",
      as: "inventory",
    });
  };
  return GaPurchaseOrderItemReceiptUnit;
};
