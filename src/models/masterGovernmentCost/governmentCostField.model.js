const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const GovernmentCostFields = sequelize.define(
    "GovernmentCostFields",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for GovernmentCostFields",
      },
      id_government_cost: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "government_costs",
          key: "id",
        },
        comment: "GovernmentCost id from government_costs table",
      },
      field_name_indo: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Fields name for Indonesian",
      },
      field_name_mandarin: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Fields name for Mandarin",
      },
      field_type: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Fields type like text, number,dropdown etc.",
      },
      field_value: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "Fields value like for value dropdown etc.",
        get() {
          const raw = this.getDataValue("field_value");
          try {
            return JSON.parse(raw);
          } catch {
            return raw;
          }
        },
      },
    },
    {
      tableName: "government_costs_fields",
      timestamps: true,
      underscored: true,
    },
  );

  // Define associations
  GovernmentCostFields.associate = (models) => {
    // GovernmentCost Fields belongs to GovernmentCost
    GovernmentCostFields.belongsTo(models.GovernmentCost, {
      foreignKey: "id_government_cost",
      as: "government_cost",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return GovernmentCostFields;
};
