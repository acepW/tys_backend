const { DataTypes } = require("sequelize");

// One inventory row counted in an opname. The item details and system quantity
// are copied when the opname is created.
module.exports = (sequelize) => {
  const InventoryOpnameItem = sequelize.define(
    "InventoryOpnameItem",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_inventory_opname: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "inventory_opnames", key: "id" },
      },
      id_inventory: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "inventories", key: "id" },
      },
      item_name: { type: DataTypes.STRING(500), allowNull: false },
      brand: { type: DataTypes.STRING(255), allowNull: true },
      serial_number: { type: DataTypes.STRING(255), allowNull: true },
      size: { type: DataTypes.STRING(255), allowNull: true },
      material: { type: DataTypes.STRING(255), allowNull: true },
      other: { type: DataTypes.TEXT, allowNull: true },
      quantity_unit: { type: DataTypes.STRING(100), allowNull: false },
      quantity_system: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        comment: "Inventory quantity when the opname was created",
      },
      quantity_actual: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        comment: "Counted quantity",
      },
      quantity_difference: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        comment: "quantity_actual - quantity_system, added to inventory on approval",
      },
      input_status: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Free-text status filled by the counting user",
      },
      note: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM("pending", "save", "approve", "reject"),
        allowNull: false,
        defaultValue: "pending",
        comment: "pending = not counted, save = counted, approve/reject = reviewed",
      },
      review_note: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Latest approve/reject note from the reviewer",
      },
    },
    {
      tableName: "inventory_opname_items",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["id_inventory_opname", "status"] },
        { fields: ["id_inventory"] },
      ],
    },
  );
  InventoryOpnameItem.associate = (models) => {
    InventoryOpnameItem.belongsTo(models.InventoryOpname, {
      foreignKey: "id_inventory_opname",
      as: "inventory_opname",
    });
    InventoryOpnameItem.belongsTo(models.Inventory, {
      foreignKey: "id_inventory",
      as: "inventory",
    });
  };
  return InventoryOpnameItem;
};
