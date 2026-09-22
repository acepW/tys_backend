const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const AttendanceDevice = sequelize.define(
    "AttendanceDevice",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      serial_number: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: "Serial number sent by the ZKTeco device",
      },
      name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      location: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      timezone_offset: {
        type: DataTypes.STRING(6),
        allowNull: false,
        defaultValue: "+07:00",
        validate: {
          is: /^[+-](?:0\d|1[0-4]):[0-5]\d$/,
        },
        comment: "Device UTC offset used to parse local punch timestamps",
      },
      last_seen_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      last_ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
      },
      is_auto_registered: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "True when the device was discovered through Push Protocol",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "attendance_devices",
      timestamps: true,
      underscored: true,
      indexes: [{ name: "idx_attendance_device_active", fields: ["is_active"] }],
    },
  );

  AttendanceDevice.associate = (models) => {
    AttendanceDevice.hasMany(models.AttendanceLog, {
      foreignKey: "id_attendance_device",
      as: "attendance_logs",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return AttendanceDevice;
};
