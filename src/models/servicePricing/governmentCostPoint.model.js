const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const GovernmentCostPoint = sequelize.define(
    "GovernmentCostPoint",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Project Plan",
      },
      id_government_cost: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "service_pricing_government_cost",
          key: "id",
        },
        comment: "Foreign key for Service Pricing",
      },

      cost_structure_indo: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "cost structure in Indonesian",
      },
      cost_structure_mandarin: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "cost structure in Mandarin",
      },
      cost_usd: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "cost usd",
      },
      value_fob: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "value fob",
      },
      index: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "data sequence",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Government Cost (active/inactive)",
      },
    },
    {
      tableName: "service_pricing_government_cost_point",
      timestamps: true,
      underscored: true,
      indexes: [
        // Prefix index untuk string panjang
        {
          name: "idx_id_government_cost",
          fields: ["id_government_cost"],
        },
        // Composite index (lebih efisien dari is_active standalone)
        {
          name: "idx_government_cost_active",
          fields: ["id_government_cost", "is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  GovernmentCostPoint.associate = (models) => {
    // Contoh: GovernmentCostPoint dapat memiliki relasi dengan Order, dll
    // GovernmentCostPoint.hasMany(models.Order, { ... });
  };

  return GovernmentCostPoint;
};
