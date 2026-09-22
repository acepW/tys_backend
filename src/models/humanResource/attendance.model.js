const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Attendance = sequelize.define(
    "Attendance",
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      id_employee: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "employees", key: "id" },
      },
      attendance_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      check_in_at: { type: DataTypes.DATE, allowNull: true },
      check_out_at: { type: DataTypes.DATE, allowNull: true },
      break_out_at: { type: DataTypes.DATE, allowNull: true },
      break_in_at: { type: DataTypes.DATE, allowNull: true },
      overtime_in_at: { type: DataTypes.DATE, allowNull: true },
      overtime_out_at: { type: DataTypes.DATE, allowNull: true },
      first_punch_at: { type: DataTypes.DATE, allowNull: true },
      last_punch_at: { type: DataTypes.DATE, allowNull: true },
      work_minutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      status: {
        type: DataTypes.ENUM("present", "incomplete"),
        allowNull: false,
        defaultValue: "incomplete",
      },
    },
    {
      tableName: "attendances",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "uq_attendance_employee_date",
          unique: true,
          fields: ["id_employee", "attendance_date"],
        },
        { name: "idx_attendance_date", fields: ["attendance_date"] },
      ],
    },
  );

  Attendance.associate = (models) => {
    Attendance.belongsTo(models.Employee, {
      foreignKey: "id_employee",
      as: "employee",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Attendance;
};
