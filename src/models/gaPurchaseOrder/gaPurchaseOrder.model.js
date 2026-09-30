const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const GaPurchaseOrder = sequelize.define("GaPurchaseOrder", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ga_purchase_order_no: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    id_company: { type: DataTypes.INTEGER, allowNull: false, references: { model: "companies", key: "id" } },
    id_user_request: { type: DataTypes.INTEGER, allowNull: false, references: { model: "users", key: "id" } },
    request_date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    planned_purchase_date: { type: DataTypes.DATE, allowNull: true },
    remarks: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM("request ga manager", "request fat", "request director", "approved", "rejected ga manager", "rejected fat", "rejected director"),
      allowNull: false, defaultValue: "request ga manager",
    },
  }, { tableName: "ga_purchase_orders", timestamps: true, underscored: true,
    indexes: [{ fields: ["id_company", "created_at"] }, { fields: ["status"] }] });
  GaPurchaseOrder.associate = (models) => {
    GaPurchaseOrder.belongsTo(models.Company, { foreignKey: "id_company", as: "company" });
    GaPurchaseOrder.belongsTo(models.User, { foreignKey: "id_user_request", as: "user_request" });
    GaPurchaseOrder.hasMany(models.GaPurchaseOrderItem, { foreignKey: "id_ga_purchase_order", as: "items" });
    GaPurchaseOrder.hasMany(models.GaPurchaseOrderVerificationProgress, { foreignKey: "id_ga_purchase_order", as: "verification_progress" });
    GaPurchaseOrder.hasMany(models.File, { foreignKey: "fileable_id", constraints: false,
      scope: { fileable_type: "ga_purchase_orders", category: "file_attachment" }, as: "file_attachment" });
  };
  return GaPurchaseOrder;
};
