const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const EmployeeAllowance = sequelize.define(
    "EmployeeAllowance",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_employee: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "employees", key: "id" },
      },
      allowance: { type: DataTypes.STRING(200), allowNull: false },
      amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    },
    {
      tableName: "employee_allowances",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "idx_employee_allowance_employee", fields: ["id_employee"] },
      ],
    },
  );

  EmployeeAllowance.associate = (models) => {
    EmployeeAllowance.belongsTo(models.Employee, {
      foreignKey: "id_employee",
      as: "employee",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return EmployeeAllowance;
};
