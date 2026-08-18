const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ServicePricingGovernmentCostField = sequelize.define(
    "ServicePricingGovernmentCostField",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Project Plan",
      },
      id_service_pricing_government_cost_table: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "service_pricing_government_cost_table",
          key: "id",
        },
        comment: "Foreign key for Service Pricing",
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
      value_indo: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "result value for Indonesian",
      },
      value_mandarin: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "result value for Indonesian",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Government Cost (active/inactive)",
      },
    },
    {
      tableName: "service_pricing_government_cost_field",
      timestamps: true,
      underscored: true,
      indexes: [
        // Prefix index untuk string panjang
        {
          name: "idx_id_service_pricing_government_cost",
          fields: ["id_service_pricing_government_cost"],
        },
        // Composite index (lebih efisien dari is_active standalone)
        {
          name: "idx_service_pricing_government_cost_active",
          fields: ["id_service_pricing_government_cost", "is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  ServicePricingGovernmentCostField.associate = (models) => {
    // Contoh: ServicePricingGovernmentCostField dapat memiliki relasi dengan Order, dll
    // ServicePricingGovernmentCostField.hasMany(models.Order, { ... });
  };

  return ServicePricingGovernmentCostField;
};
