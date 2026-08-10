const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const GovernmentCost = sequelize.define(
    "GovernmentCost",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for GovernmentCost",
      },
      id_category: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "categories",
          key: "id",
        },
        comment: "Foreign key to categories table",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of GovernmentCost (active/inactive)",
      },
    },
    {
      tableName: "government_costs",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_category",
          fields: ["id_category"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    },
  );

  // Define associations
  GovernmentCost.associate = (models) => {
    // GovernmentCost belongs to Category
    GovernmentCost.belongsTo(models.Category, {
      foreignKey: "id_category",
      as: "category",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // GovernmentCost belongs to GovernmentCost Fields
    GovernmentCost.hasMany(models.GovernmentCostFields, {
      foreignKey: "id_government_cost",
      as: "government_cost_fields",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return GovernmentCost;
};
