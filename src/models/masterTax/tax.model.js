const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Tax = sequelize.define(
    "Tax",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for tax master",
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: "Unique tax code, for example PPN or PPH_23",
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Tax name",
      },
      rate: {
        type: DataTypes.DECIMAL(7, 4),
        allowNull: false,
        validate: {
          min: 0,
          max: 100,
        },
        comment: "Tax percentage, for example 11.0000 for 11%",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: "Whether the tax can be used in calculations",
      },
    },
    {
      tableName: "taxes",
      timestamps: true,
      underscored: true,
      indexes: [{ name: "idx_tax_is_active", fields: ["is_active"] }],
    },
  );

  return Tax;
};
