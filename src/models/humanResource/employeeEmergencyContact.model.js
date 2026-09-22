const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const EmployeeEmergencyContact = sequelize.define(
    "EmployeeEmergencyContact",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_employee: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "employees", key: "id" },
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      contact_number: {
        type: DataTypes.STRING(30),
        allowNull: false,
      },
    },
    {
      tableName: "employee_emergency_contacts",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_employee_emergency_contact_employee",
          fields: ["id_employee"],
        },
      ],
    },
  );

  EmployeeEmergencyContact.associate = (models) => {
    EmployeeEmergencyContact.belongsTo(models.Employee, {
      foreignKey: "id_employee",
      as: "employee",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return EmployeeEmergencyContact;
};
