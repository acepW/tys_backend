const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ServicePricingGovernmentCostTable = sequelize.define(
    "ServicePricingGovernmentCostTable",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for ServicePricingGovernmentCostTable",
      },
      id_service_pricing_government_cost: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "service_pricing_government_cost",
          key: "id",
        },
        comment: "Foreign key for Service Pricing",
      },
      index: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "index for ordering the products in the quotation category",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Government Cost (active/inactive)",
      },
    },
    {
      tableName: "service_pricing_government_cost_table",
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
          name: "idx_service_pricing_active",
          fields: ["id_service_pricing_government_cost", "is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  ServicePricingGovernmentCostTable.associate = (models) => {
    // Contoh: ServicePricingGovernmentCostTable dapat memiliki relasi dengan Order, dll
    // ServicePricingGovernmentCostTable.hasMany(models.Order, { ... });

    // ServicePricingGovernmentCostTable belongs to Service Pricing
    ServicePricingGovernmentCostTable.belongsTo(
      models.ServicePricingGovernmentCost,
      {
        foreignKey: "id_service_pricing_government_cost",
        as: "service_pricing_government_cost",
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
    );

    // ServicePricingGovernmentCostTable has many ServicePricingGovernmentCostTableFields
    ServicePricingGovernmentCostTable.hasMany(
      models.ServicePricingGovernmentCostField,
      {
        foreignKey: "id_service_pricing_government_cost_table",
        as: "fields",
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
    );
  };

  return ServicePricingGovernmentCostTable;
};
