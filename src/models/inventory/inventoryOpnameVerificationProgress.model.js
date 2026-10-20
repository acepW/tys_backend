const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Progress = sequelize.define(
    "InventoryOpnameVerificationProgress",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_inventory_opname: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "inventory_opnames", key: "id" },
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
      tableName: "inventory_opname_verification_progress",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["id_inventory_opname"] }],
    },
  );
  Progress.associate = (models) => {
    Progress.belongsTo(models.InventoryOpname, {
      foreignKey: "id_inventory_opname",
      as: "inventory_opname",
    });
    Progress.belongsTo(models.User, { foreignKey: "id_user", as: "user" });
  };
  return Progress;
};
