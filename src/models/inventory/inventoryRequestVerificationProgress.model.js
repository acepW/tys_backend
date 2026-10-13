const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Progress = sequelize.define(
    "InventoryRequestVerificationProgress",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_inventory_request: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "inventory_requests", key: "id" },
      },
      id_user: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      status: { type: DataTypes.STRING(50), allowNull: false },
      note: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "inventory_request_verification_progress",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["id_inventory_request"] }],
    },
  );
  Progress.associate = (models) => {
    Progress.belongsTo(models.InventoryRequest, {
      foreignKey: "id_inventory_request",
      as: "inventory_request",
    });
    Progress.belongsTo(models.User, { foreignKey: "id_user", as: "user" });
  };
  return Progress;
};
