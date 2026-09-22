const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Employee = sequelize.define(
    "Employee",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      employee_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      device_user_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: "PIN/User ID registered on the attendance device",
      },
      full_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(100),
        allowNull: true,
        validate: { isEmail: true },
      },
      phone: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      id_company: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "companies", key: "id" },
      },
      id_division: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "divisions", key: "id" },
      },
      id_department: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "departments", key: "id" },
      },
      id_position: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "positions", key: "id" },
      },
      hire_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      termination_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "employees",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "idx_employee_company", fields: ["id_company"] },
        { name: "idx_employee_active", fields: ["is_active"] },
      ],
    },
  );

  Employee.associate = (models) => {
    Employee.belongsTo(models.Company, {
      foreignKey: "id_company",
      as: "company",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    Employee.belongsTo(models.Division, {
      foreignKey: "id_division",
      as: "division",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    Employee.belongsTo(models.Department, {
      foreignKey: "id_department",
      as: "department",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    Employee.belongsTo(models.Position, {
      foreignKey: "id_position",
      as: "position",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    Employee.hasMany(models.AttendanceLog, {
      foreignKey: "id_employee",
      as: "attendance_logs",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    Employee.hasMany(models.Attendance, {
      foreignKey: "id_employee",
      as: "attendances",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Employee;
};
