const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const EmployeeFamilyMember = sequelize.define(
    "EmployeeFamilyMember",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_employee: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "employees", key: "id" },
      },
      name: { type: DataTypes.STRING(200), allowNull: false },
      relationship: { type: DataTypes.STRING(100), allowNull: false },
      contact_number: { type: DataTypes.STRING(30), allowNull: false },
      address: { type: DataTypes.TEXT, allowNull: false },
    },
    {
      tableName: "employee_family_members",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "idx_employee_family_member_employee", fields: ["id_employee"] },
      ],
    },
  );

  EmployeeFamilyMember.associate = (models) => {
    EmployeeFamilyMember.belongsTo(models.Employee, {
      foreignKey: "id_employee",
      as: "employee",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return EmployeeFamilyMember;
};
