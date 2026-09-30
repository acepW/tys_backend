const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Progress = sequelize.define("GaPurchaseOrderVerificationProgress", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    id_ga_purchase_order: { type: DataTypes.INTEGER, allowNull: false, references: { model: "ga_purchase_orders", key: "id" } },
    id_user: { type: DataTypes.INTEGER, allowNull: false, references: { model: "users", key: "id" } },
    status: { type: DataTypes.STRING(50), allowNull: false },
    note: { type: DataTypes.TEXT, allowNull: true },
  }, { tableName: "ga_purchase_order_verification_progress", timestamps: true, underscored: true,
    indexes: [{ fields: ["id_ga_purchase_order"] }] });
  Progress.associate = (models) => {
    Progress.belongsTo(models.GaPurchaseOrder, { foreignKey: "id_ga_purchase_order", as: "ga_purchase_order" });
    Progress.belongsTo(models.User, { foreignKey: "id_user", as: "user" });
  };
  return Progress;
};
