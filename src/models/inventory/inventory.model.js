const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Inventory = sequelize.define(
    "Inventory",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      item_name: { type: DataTypes.STRING(500), allowNull: false },
      brand: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Brand (merk) of the item",
      },
      serial_number: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Serial number (no seri) of the item",
      },
      size: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Size (ukuran) of the item",
      },
      material: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Material (bahan) of the item",
      },
      other: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Other specification (lainnya) of the item",
      },
      purchase_request_category: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      quantity_unit: { type: DataTypes.STRING(100), allowNull: false },
      quantity: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: "Current stock quantity",
      },
    },
    {
      tableName: "inventories",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["item_name"] }],
    },
  );
  Inventory.associate = (models) => {
    Inventory.hasMany(models.InventoryHistory, {
      foreignKey: "id_inventory",
      as: "histories",
    });
    Inventory.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: "inventories", category: "files_product" },
      as: "files_product",
    });
  };
  return Inventory;
};
