const { DataTypes } = require("sequelize");

// Master of goods (master barang), e.g. LTP - Laptop. Purchase request items pick
// one, and item_code is the prefix of the product codes (LTP-00001) given to
// stock when it enters inventory.
module.exports = (sequelize) => {
  const MasterItem = sequelize.define(
    "MasterItem",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      item_code: {
        type: DataTypes.STRING(10),
        allowNull: false,
        unique: true,
        comment: "Item code (kode barang), 2-10 uppercase letters/digits, e.g. LTP",
      },
      item_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "Item name (nama barang), e.g. Laptop",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "master_items",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["item_name"] }, { fields: ["is_active"] }],
    },
  );
  return MasterItem;
};
