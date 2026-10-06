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
        unique: true,
        references: { model: "ga_purchase_order_items", key: "id" },
        comment: "GA purchase order item that added the stock",
      },
      id_user: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      quantity: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        comment: "Quantity added to the inventory",
      },
      note: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "inventory_histories",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["id_inventory"] }],
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
    InventoryHistory.belongsTo(models.User, {
      foreignKey: "id_user",
      as: "user",
    });
  };
  return InventoryHistory;
};
