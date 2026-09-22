const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "Holiday",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      holiday_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
    },
    {
      tableName: "holidays",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "uq_holiday_date",
          unique: true,
          fields: ["holiday_date"],
        },
      ],
    },
  );
