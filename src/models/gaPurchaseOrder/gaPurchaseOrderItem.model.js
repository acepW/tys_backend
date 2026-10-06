const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const GaPurchaseOrderItem = sequelize.define(
    "GaPurchaseOrderItem",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_ga_purchase_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "ga_purchase_orders", key: "id" },
      },
      id_purchase_request: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "purchase_requests", key: "id" },
      },
      id_purchase_request_item: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: "purchase_request_items", key: "id" },
      },
      id_vendor: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "vendors", key: "id" },
      },
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
      estimated_unit_price: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      estimated_total_price: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      sub_total: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      tax_ppn: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      tax_pph_23: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      tax_pp_20: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      tax_pph_4_ayat_2: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      ppn: {
        type: DataTypes.DECIMAL(15, 0),
        allowNull: false,
        defaultValue: 0,
      },
      pph: {
        type: DataTypes.DECIMAL(15, 0),
        allowNull: false,
        defaultValue: 0,
      },
      pp_20: {
        type: DataTypes.DECIMAL(15, 0),
        allowNull: false,
        defaultValue: 0,
      },
      pph_4_ayat_2: {
        type: DataTypes.DECIMAL(15, 0),
        allowNull: false,
        defaultValue: 0,
      },
      total: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "ga_purchase_order_items",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["id_ga_purchase_order"] },
        { fields: ["id_purchase_request"] },
      ],
    },
  );
  GaPurchaseOrderItem.associate = (models) => {
    GaPurchaseOrderItem.belongsTo(models.GaPurchaseOrder, {
      foreignKey: "id_ga_purchase_order",
      as: "ga_purchase_order",
    });
    GaPurchaseOrderItem.belongsTo(models.PurchaseRequest, {
      foreignKey: "id_purchase_request",
      as: "purchase_request",
    });
    GaPurchaseOrderItem.belongsTo(models.PurchaseRequestItem, {
      foreignKey: "id_purchase_request_item",
      as: "purchase_request_item",
    });
    GaPurchaseOrderItem.belongsTo(models.Vendor, {
      foreignKey: "id_vendor",
      as: "vendor",
    });
    GaPurchaseOrderItem.belongsTo(models.User, {
      foreignKey: "id_requester",
      as: "requester",
    });
    for (const category of ["files_product", "files_attachment"]) {
      GaPurchaseOrderItem.hasMany(models.File, {
        foreignKey: "fileable_id",
        constraints: false,
        scope: { fileable_type: "ga_purchase_order_items", category },
        as: category,
      });
    }
  };
  return GaPurchaseOrderItem;
};
