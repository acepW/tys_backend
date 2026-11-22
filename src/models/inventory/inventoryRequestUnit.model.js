const { DataTypes } = require("sequelize");

// One unit of an inventory request made with serial numbers (has_serial_number).
// On approval each unit becomes its own inventory row (quantity 1) with its own
// product code; id_inventory points at it.
module.exports = (sequelize) => {
  const InventoryRequestUnit = sequelize.define(
    "InventoryRequestUnit",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_inventory_request: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "inventory_requests", key: "id" },
      },
      serial_number: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "Serial number (no seri) of the unit",
      },
      id_inventory: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "inventories", key: "id" },
        comment: "Inventory row the unit went into on approval",
      },
    },
    {
      tableName: "inventory_request_units",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["id_inventory_request"] },
        { fields: ["serial_number"] },
      ],
    },
  );
  InventoryRequestUnit.associate = (models) => {
    InventoryRequestUnit.belongsTo(models.InventoryRequest, {
      foreignKey: "id_inventory_request",
      as: "inventory_request",
    });
    InventoryRequestUnit.belongsTo(models.Inventory, {
      foreignKey: "id_inventory",
      as: "inventory",
    });
  };
  return InventoryRequestUnit;
};
