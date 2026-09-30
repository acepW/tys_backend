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
      item_name: { type: DataTypes.STRING(500), allowNull: false },
      specification: { type: DataTypes.TEXT, allowNull: true },
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
      average_usage: { type: DataTypes.STRING(255), allowNull: true },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      product_link: { type: DataTypes.STRING(1000), allowNull: true },
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
