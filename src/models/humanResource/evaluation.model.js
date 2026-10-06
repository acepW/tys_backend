const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Evaluation = sequelize.define(
    "Evaluation",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      type: {
        type: DataTypes.ENUM("probation", "annual"),
        allowNull: false,
        comment: "Evaluation type: probation or annual (tahunan)",
      },
      id_employee: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "employees", key: "id" },
        comment: "Evaluated employee",
      },
      id_position: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "positions", key: "id" },
        comment: "Employee position (jabatan) at evaluation time",
      },
      id_department: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "departments", key: "id" },
        comment: "Employee department at evaluation time",
      },
      hire_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: "Hire date (tanggal masuk)",
      },
      working_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Number of working days (jumlah hari kerja)",
      },
      present_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Number of days present (jumlah kehadiran)",
      },
      sick_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Number of sick days (jumlah sakit)",
      },
      absent_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Number of absent days (jumlah tidak hadir)",
      },
      permission_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Number of permission days (jumlah izin)",
      },
      leave_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Number of leave days (jumlah cuti)",
      },
      late_minutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Total late time in minutes (jumlah terlambat dalam menit)",
      },
      attendance_assessment: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        comment: "Attendance assessment score (penilaian absensi kehadiran)",
      },
      id_user_create: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "User who created the evaluation",
      },
    },
    {
      tableName: "evaluations",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "idx_evaluation_employee", fields: ["id_employee"] },
        { name: "idx_evaluation_type", fields: ["type"] },
      ],
    },
  );

  Evaluation.associate = (models) => {
    Evaluation.belongsTo(models.Employee, {
      foreignKey: "id_employee",
      as: "employee",
    });
    Evaluation.belongsTo(models.Position, {
      foreignKey: "id_position",
      as: "position",
    });
    Evaluation.belongsTo(models.Department, {
      foreignKey: "id_department",
      as: "department",
    });
    Evaluation.belongsTo(models.User, {
      foreignKey: "id_user_create",
      as: "user_create",
    });
  };

  return Evaluation;
};
