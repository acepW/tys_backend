const { DataTypes } = require("sequelize");

// Moves stock of one inventory row to another location of the same company.
// Stock transfer and stock allocation (putaway) move stock the same way; the type
// only records why. Approved by SPV GA, then Manager GA; the stock moves on the
// Manager GA approval.
module.exports = (sequelize) => {
  const InventoryMovement = sequelize.define(
    "InventoryMovement",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      movement_no: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: "IM-<company initial>-MM-YYYY-0001, restarting every year",
      },
      movement_type: {
        type: DataTypes.ENUM("stock transfer", "stock allocation"),
        allowNull: false,
      },
      id_company: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "companies", key: "id" },
        comment: "Company of the source inventory row",
      },
      id_inventory_source: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "inventories", key: "id" },
        comment: "Inventory row the stock is taken from",
      },
      id_inventory_location_source: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "inventory_locations", key: "id" },
        comment: "Location of the source row when the movement was created",
      },
      id_inventory_location_destination: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "inventory_locations", key: "id" },
      },
      id_inventory_destination: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "inventories", key: "id" },
        comment: "Inventory row the stock was added to on the final approval",
      },
      item_name: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Copied from the source row for lists and My Task",
      },
      quantity_unit: { type: DataTypes.STRING(100), allowNull: false },
      quantity: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
      reason: { type: DataTypes.STRING(255), allowNull: true },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Remarks / justification",
      },
      status: {
        type: DataTypes.ENUM(
          "request spv ga",
          "request manager ga",
          "approved",
          "rejected",
        ),
        allowNull: false,
        defaultValue: "request spv ga",
      },
      id_user_request: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "inventory_movements",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["status"] },
        { fields: ["id_company"] },
        { fields: ["id_inventory_source"] },
      ],
    },
  );
  InventoryMovement.associate = (models) => {
    InventoryMovement.belongsTo(models.Company, {
      foreignKey: "id_company",
      as: "company",
    });
    InventoryMovement.belongsTo(models.Inventory, {
      foreignKey: "id_inventory_source",
      as: "inventory_source",
    });
    InventoryMovement.belongsTo(models.Inventory, {
      foreignKey: "id_inventory_destination",
      as: "inventory_destination",
    });
    InventoryMovement.belongsTo(models.InventoryLocation, {
      foreignKey: "id_inventory_location_source",
      as: "inventory_location_source",
    });
    InventoryMovement.belongsTo(models.InventoryLocation, {
      foreignKey: "id_inventory_location_destination",
      as: "inventory_location_destination",
    });
    InventoryMovement.belongsTo(models.User, {
      foreignKey: "id_user_request",
      as: "user_request",
    });
    InventoryMovement.hasMany(models.InventoryMovementVerificationProgress, {
      foreignKey: "id_inventory_movement",
      as: "verification_progress",
    });
  };
  return InventoryMovement;
};
