const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PurchaseRequestItem = sequelize.define(
    "PurchaseRequestItem",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_purchase_request: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "purchase_requests", key: "id" },
      },
      id_master_item: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "master_items", key: "id" },
        comment: "Master item picked by the requester; NULL for items created before the master existed",
      },
      item_name: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Copied from the master item",
      },
      brand: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Brand (merk) of the item",
      },
      model_number: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Model number of the item (replaces the old serial_number column)",
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
        allowNull: false,
      },
      quantity_unit: { type: DataTypes.STRING(100), allowNull: false },
      quantity: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
      id_requester: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      procurement_type: {
        type: DataTypes.ENUM(
          "Pengadaan Rutin",
          "Pembaruan Stok",
          "Pengadaan Baru",
        ),
        allowNull: false,
      },
      item_category: {
        type: DataTypes.ENUM("item", "services"),
        allowNull: false,
        defaultValue: "item",
        comment: "Item category, set by requester on create",
      },
      asset_category: {
        type: DataTypes.ENUM("asset", "non asset"),
        allowNull: true,
        comment: "Asset category, set by GA on approval",
      },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      ga_decision: {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "pending",
      },
      id_ga_purchase_order: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
      tableName: "purchase_request_items",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["id_purchase_request"] },
        { fields: ["ga_decision", "id_ga_purchase_order"] },
      ],
    },
  );

  PurchaseRequestItem.associate = (models) => {
    PurchaseRequestItem.belongsTo(models.PurchaseRequest, {
      foreignKey: "id_purchase_request",
      as: "purchase_request",
    });
    PurchaseRequestItem.belongsTo(models.User, {
      foreignKey: "id_requester",
      as: "requester",
    });
    PurchaseRequestItem.belongsTo(models.MasterItem, {
      foreignKey: "id_master_item",
      as: "master_item",
    });
    PurchaseRequestItem.belongsTo(models.GaPurchaseOrder, {
      foreignKey: "id_ga_purchase_order",
      as: "ga_purchase_order",
    });
    PurchaseRequestItem.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: {
        fileable_type: "purchase_request_items",
        category: "files_product",
      },
      as: "files_product",
    });
  };
  return PurchaseRequestItem;
};
