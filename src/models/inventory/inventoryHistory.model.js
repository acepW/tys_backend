const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const InventoryHistory = sequelize.define(
    "InventoryHistory",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_inventory: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "inventories", key: "id" },
      },
      id_ga_purchase_order: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "ga_purchase_orders", key: "id" },
        comment: "GA purchase order that added the stock",
      },
      id_ga_purchase_order_item: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "ga_purchase_order_items", key: "id" },
        comment: "GA purchase order item that added the stock",
      },
      id_ga_purchase_order_item_receipt: {
        type: DataTypes.INTEGER,
        allowNull: true,
        unique: true,
        references: { model: "ga_purchase_order_item_receipts", key: "id" },
        comment: "Goods receipt that added the stock (one item can have several)",
      },
      id_inventory_request: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "inventory_requests", key: "id" },
        comment: "Approved inventory request that added the stock",
      },
      id_inventory_opname: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "inventory_opnames", key: "id" },
        comment: "Approved stock opname that adjusted the stock",
      },
      id_inventory_opname_item: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "inventory_opname_items", key: "id" },
        comment: "Opname item whose difference adjusted the stock",
      },
      id_user: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      quantity: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        comment: "Quantity added to the inventory (negative when an opname reduces it)",
      },
      note: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "inventory_histories",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["id_inventory"] },
        { fields: ["id_ga_purchase_order_item"] },
      ],
    },
  );
  InventoryHistory.associate = (models) => {
    InventoryHistory.belongsTo(models.Inventory, {
      foreignKey: "id_inventory",
      as: "inventory",
    });
    InventoryHistory.belongsTo(models.GaPurchaseOrder, {
      foreignKey: "id_ga_purchase_order",
      as: "ga_purchase_order",
    });
    InventoryHistory.belongsTo(models.GaPurchaseOrderItem, {
      foreignKey: "id_ga_purchase_order_item",
      as: "ga_purchase_order_item",
    });
    InventoryHistory.belongsTo(models.GaPurchaseOrderItemReceipt, {
      foreignKey: "id_ga_purchase_order_item_receipt",
      as: "ga_purchase_order_item_receipt",
    });
    InventoryHistory.belongsTo(models.InventoryOpname, {
      foreignKey: "id_inventory_opname",
      as: "inventory_opname",
    });
    InventoryHistory.belongsTo(models.InventoryRequest, {
      foreignKey: "id_inventory_request",
      as: "inventory_request",
    });
    InventoryHistory.belongsTo(models.User, {
      foreignKey: "id_user",
      as: "user",
    });
  };
  return InventoryHistory;
};
