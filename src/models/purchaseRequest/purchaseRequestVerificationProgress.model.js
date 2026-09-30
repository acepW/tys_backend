const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Progress = sequelize.define("PurchaseRequestVerificationProgress", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    id_purchase_request: { type: DataTypes.INTEGER, allowNull: false, references: { model: "purchase_requests", key: "id" } },
    id_user: { type: DataTypes.INTEGER, allowNull: false, references: { model: "users", key: "id" } },
    status: { type: DataTypes.STRING(50), allowNull: false },
    note: { type: DataTypes.TEXT, allowNull: true },
  }, { tableName: "purchase_request_verification_progress", timestamps: true, underscored: true,
    indexes: [{ fields: ["id_purchase_request"] }] });
  Progress.associate = (models) => {
    Progress.belongsTo(models.PurchaseRequest, { foreignKey: "id_purchase_request", as: "purchase_request" });
    Progress.belongsTo(models.User, { foreignKey: "id_user", as: "user" });
  };
  return Progress;
};
