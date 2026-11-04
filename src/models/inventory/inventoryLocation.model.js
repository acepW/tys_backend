const { DataTypes } = require("sequelize");

// Master of places where inventory is stored. A company has a default location
// used for stock coming in from GA purchase orders.
module.exports = (sequelize) => {
  const InventoryLocation = sequelize.define(
    "InventoryLocation",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      location_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: "Location code (kode lokasi)",
      },
      location_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Location name (nama lokasi)",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "inventory_locations",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["location_name"] }, { fields: ["is_active"] }],
    },
  );
  InventoryLocation.associate = (models) => {
    InventoryLocation.hasMany(models.Company, {
      foreignKey: "id_inventory_location",
      as: "companies",
    });
    InventoryLocation.hasMany(models.Inventory, {
      foreignKey: "id_inventory_location",
      as: "inventories",
    });
  };
  return InventoryLocation;
};
