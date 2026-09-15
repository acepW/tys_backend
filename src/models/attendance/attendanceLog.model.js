const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const AttendanceLog = sequelize.define(
    "AttendanceLog",
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      id_attendance_device: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "attendance_devices", key: "id" },
      },
      id_employee: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "employees", key: "id" },
      },
      device_user_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      attendance_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: "Local calendar date reported by the device",
      },
      occurred_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      punch_state: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      punch_type: {
        type: DataTypes.ENUM(
          "check_in",
          "check_out",
          "break_out",
          "break_in",
          "overtime_in",
          "overtime_out",
          "unknown",
        ),
        allowNull: false,
        defaultValue: "unknown",
      },
      verify_mode: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      work_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      event_key: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        comment: "Idempotency key for device retransmissions",
      },
      processing_status: {
        type: DataTypes.ENUM("processed", "unmatched", "ignored"),
        allowNull: false,
        defaultValue: "unmatched",
      },
      raw_payload: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      received_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "attendance_logs",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_attendance_log_employee_date",
          fields: ["id_employee", "attendance_date"],
        },
        {
          name: "idx_attendance_log_device_date",
          fields: ["id_attendance_device", "attendance_date"],
        },
        {
          name: "idx_attendance_log_processing_status",
          fields: ["processing_status"],
        },
      ],
    },
  );

  AttendanceLog.associate = (models) => {
    AttendanceLog.belongsTo(models.AttendanceDevice, {
      foreignKey: "id_attendance_device",
      as: "attendance_device",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    AttendanceLog.belongsTo(models.Employee, {
      foreignKey: "id_employee",
      as: "employee",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
  };

  return AttendanceLog;
};
