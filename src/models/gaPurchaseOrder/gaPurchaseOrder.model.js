const { DataTypes } = require("sequelize");

const statuses = [
  "request ga manager",
  "request director",
  "request ar ap",
  "request fat",
  "request cashier",
  "request receiving",
  "return request ga manager",
  "return request ar ap",
  "return request cashier",
  "finished",
  "rejected ga manager",
  "rejected director",
  "rejected ar ap",
  "rejected fat",
  "rejected cashier",
];
const fileCategories = [
  "file_attachment",
  "files_payment",
  "files_purchase_proof",
  "files_goods_receipt",
];

module.exports = (sequelize) => {
  const GaPurchaseOrder = sequelize.define(
    "GaPurchaseOrder",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      ga_purchase_order_no: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },
      id_company: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "companies", key: "id" },
      },
      id_user_request: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      request_date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      planned_purchase_date: { type: DataTypes.DATE, allowNull: true },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      payment_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        comment: "Payment amount (nominal) recorded by cashier",
      },
      payment_date: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Payment date recorded by cashier",
      },
      payment_note: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Payment note recorded by cashier",
      },
      received_date: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Goods receipt date recorded by GA staff",
      },
      receipt_note: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Goods receipt note recorded by GA staff",
      },
      return_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Number of times the goods were returned",
      },
      status: {
        type: DataTypes.ENUM(...statuses),
        allowNull: false,
        defaultValue: "request ga manager",
      },
    },
    {
      tableName: "ga_purchase_orders",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["id_company", "created_at"] },
        { fields: ["status"] },
      ],
    },
  );
  GaPurchaseOrder.associate = (models) => {
    GaPurchaseOrder.belongsTo(models.Company, {
      foreignKey: "id_company",
      as: "company",
    });
    GaPurchaseOrder.belongsTo(models.User, {
      foreignKey: "id_user_request",
      as: "user_request",
    });
    GaPurchaseOrder.hasMany(models.GaPurchaseOrderItem, {
      foreignKey: "id_ga_purchase_order",
      as: "items",
    });
    GaPurchaseOrder.hasMany(models.GaPurchaseOrderVerificationProgress, {
      foreignKey: "id_ga_purchase_order",
      as: "verification_progress",
    });
    for (const category of fileCategories) {
      GaPurchaseOrder.hasMany(models.File, {
        foreignKey: "fileable_id",
        constraints: false,
        scope: { fileable_type: "ga_purchase_orders", category },
        as: category,
      });
    }
  };
  return GaPurchaseOrder;
};
