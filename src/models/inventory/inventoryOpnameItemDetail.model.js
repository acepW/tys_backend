const { DataTypes } = require("sequelize");

// Optional breakdown of a counted opname item by input status, e.g. 7 good and
// 3 broken. Saved together with the item count; saving again replaces it.
module.exports = (sequelize) => {
  const InventoryOpnameItemDetail = sequelize.define(
    "InventoryOpnameItemDetail",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_inventory_opname_item: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "inventory_opname_items", key: "id" },
      },
      quantity: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
      input_status: { type: DataTypes.STRING(255), allowNull: false },
      note: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "inventory_opname_item_details",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["id_inventory_opname_item"] }],
    },
  );
  InventoryOpnameItemDetail.associate = (models) => {
    InventoryOpnameItemDetail.belongsTo(models.InventoryOpnameItem, {
      foreignKey: "id_inventory_opname_item",
      as: "inventory_opname_item",
    });
  };
  return InventoryOpnameItemDetail;
};
