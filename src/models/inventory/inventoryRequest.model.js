const { DataTypes } = require("sequelize");

// Manual stock entry waiting for approval. Stock is added to inventories only on approve.
module.exports = (sequelize) => {
  const InventoryRequest = sequelize.define(
    "InventoryRequest",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      item_name: { type: DataTypes.STRING(500), allowNull: false },
      brand: { type: DataTypes.STRING(255), allowNull: true },
      serial_number: { type: DataTypes.STRING(255), allowNull: true },
      size: { type: DataTypes.STRING(255), allowNull: true },
      material: { type: DataTypes.STRING(255), allowNull: true },
      other: { type: DataTypes.TEXT, allowNull: true },
      purchase_request_category: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      asset_category: {
        type: DataTypes.ENUM("asset", "non asset"),
        allowNull: true,
      },
      quantity_unit: { type: DataTypes.STRING(100), allowNull: false },
      quantity: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
      received_date: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Date the stock was received (tanggal penerimaan); required on create",
      },
      note: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM("pending", "approve", "reject"),
        allowNull: false,
        defaultValue: "pending",
      },
      id_user_request: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      id_inventory: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "inventories", key: "id" },
        comment: "Inventory row the stock was added to on approval",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "inventory_requests",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["status"] }, { fields: ["id_user_request"] }],
    },
  );
  InventoryRequest.associate = (models) => {
    InventoryRequest.belongsTo(models.User, {
      foreignKey: "id_user_request",
      as: "user_request",
    });
    InventoryRequest.belongsTo(models.Inventory, {
      foreignKey: "id_inventory",
      as: "inventory",
    });
    InventoryRequest.hasMany(models.InventoryRequestVerificationProgress, {
      foreignKey: "id_inventory_request",
      as: "verification_progress",
    });
    InventoryRequest.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: "inventory_requests", category: "files_product" },
      as: "files_product",
    });
  };
  return InventoryRequest;
};
