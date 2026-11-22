const { DataTypes } = require("sequelize");

// Manual stock entry waiting for approval. Stock is added to inventories only on approve.
module.exports = (sequelize) => {
  const InventoryRequest = sequelize.define(
    "InventoryRequest",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_master_item: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "master_items", key: "id" },
        comment: "Master item; required on create, NULL for requests created before the master existed",
      },
      item_name: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Copied from the master item",
      },
      brand: { type: DataTypes.STRING(255), allowNull: true },
      model_number: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Model number of the item (replaces the old serial_number column)",
      },
      has_serial_number: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Made with one serial number per unit (see units); otherwise by quantity only",
      },
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
      id_company: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "companies", key: "id" },
        comment: "Company owning the stock; required on create",
      },
      id_inventory_location: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "inventory_locations", key: "id" },
        comment: "Where the stock is stored; defaults to the company's location",
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
    InventoryRequest.belongsTo(models.MasterItem, {
      foreignKey: "id_master_item",
      as: "master_item",
    });
    InventoryRequest.hasMany(models.InventoryRequestUnit, {
      foreignKey: "id_inventory_request",
      as: "units",
    });
    InventoryRequest.belongsTo(models.Company, {
      foreignKey: "id_company",
      as: "company",
    });
    InventoryRequest.belongsTo(models.InventoryLocation, {
      foreignKey: "id_inventory_location",
      as: "inventory_location",
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
