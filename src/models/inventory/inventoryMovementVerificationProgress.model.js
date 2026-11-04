const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Progress = sequelize.define(
    "InventoryMovementVerificationProgress",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_inventory_movement: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "inventory_movements", key: "id" },
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
      tableName: "inventory_movement_verification_progress",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["id_inventory_movement"] }],
    },
  );
  Progress.associate = (models) => {
    Progress.belongsTo(models.InventoryMovement, {
      foreignKey: "id_inventory_movement",
      as: "inventory_movement",
    });
    Progress.belongsTo(models.User, { foreignKey: "id_user", as: "user" });
  };
  return Progress;
};
