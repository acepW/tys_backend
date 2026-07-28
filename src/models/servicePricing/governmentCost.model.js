const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const GovernmentCost = sequelize.define(
    "GovernmentCost",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Project Plan",
      },
      id_service_pricing: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "service_pricing",
          key: "id",
        },
        comment: "Foreign key for Service Pricing",
      },

      title_indo: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Title in Indonesian",
      },
      title_mandarin: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Title in Mandarin",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Government Cost (active/inactive)",
      },
    },
    {
      tableName: "service_pricing_government_cost",
      timestamps: true,
      underscored: true,
      indexes: [
        // Prefix index untuk string panjang
        {
          name: "idx_id_service_pricing",
          fields: ["id_service_pricing"],
        },
        // Composite index (lebih efisien dari is_active standalone)
        {
          name: "idx_service_pricing_active",
          fields: ["id_service_pricing", "is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  GovernmentCost.associate = (models) => {
    // Contoh: GovernmentCost dapat memiliki relasi dengan Order, dll
    // GovernmentCost.hasMany(models.Order, { ... });

    // GovernmentCost belongs to Service Pricing
    GovernmentCost.belongsTo(models.ServicePricing, {
      foreignKey: "id_service_pricing",
      as: "service_pricing",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // GovernmentCost has many GovernmentCostPoints
    GovernmentCost.hasMany(models.GovernmentCostPoint, {
      foreignKey: "id_government_cost",
      as: "government_cost_point",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return GovernmentCost;
};
