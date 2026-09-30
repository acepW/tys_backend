const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const EmployeeEducation = sequelize.define(
    "EmployeeEducation",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_employee: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "employees", key: "id" },
      },
      level: { type: DataTypes.STRING(100), allowNull: false },
      institution: { type: DataTypes.STRING(200), allowNull: false },
      major: { type: DataTypes.STRING(200), allowNull: false },
      from: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      to: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    },
    {
      tableName: "employee_education_history",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "idx_employee_education_employee", fields: ["id_employee"] },
      ],
    },
  );

  EmployeeEducation.associate = (models) => {
    EmployeeEducation.belongsTo(models.Employee, {
      foreignKey: "id_employee",
      as: "employee",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return EmployeeEducation;
};
