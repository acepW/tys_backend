const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "WorkSchedule",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      schedule_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "DEFAULT",
      },
      schedule_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      check_in_time: {
        type: DataTypes.TIME,
        allowNull: false,
      },
      check_out_time: {
        type: DataTypes.TIME,
        allowNull: false,
      },
      effective_start_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      effective_end_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: "Managed automatically when a new schedule version starts",
      },
      is_default: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "work_schedules",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "uq_work_schedule_start_date",
          unique: true,
          fields: ["effective_start_date"],
        },
        {
          name: "idx_work_schedule_effective_period",
          fields: ["effective_start_date", "effective_end_date"],
        },
        {
          name: "idx_work_schedule_default_active",
          fields: ["is_default", "is_active"],
        },
      ],
    },
  );
