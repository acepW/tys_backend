const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ServicePricingVariant = sequelize.define(
    "ServicePricingVariant",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Service Pricing",
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
      price_idr: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "Price in IDR",
      },
      price_rmb: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "Price in RMB",
      },
      information_indo: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
        comment: "Information in Indonesian",
      },
      information_mandarin: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
        comment: "Information in Mandarin",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of ServicePricingVariant (active/inactive)",
      },
    },
    {
      tableName: "service_pricing_variant",
      timestamps: true,
      underscored: true,
    },
  );

  // Define associations (untuk future development)
  ServicePricingVariant.associate = (models) => {
    // Contoh: ServicePricingVariant dapat memiliki relasi dengan Order, dll
    // ServicePricingVariant.hasMany(models.Order, { ... });

    ServicePricingVariant.belongsTo(models.ServicePricing, {
      foreignKey: "id_service_pricing",
      as: "service_pricing",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ServicePricingVariant;
};
