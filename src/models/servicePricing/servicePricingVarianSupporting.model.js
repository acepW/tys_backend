const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ServicePricingVariantSupporting = sequelize.define(
    "ServicePricingVariantSupporting",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Service Pricing",
      },
      id_service_pricing_supporting: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "service_pricing_supporting",
          key: "id",
        },
        comment: "Foreign key for Service Pricing",
      },
      price_idr: {
        allowNull: false,
        type: DataTypes.DECIMAL(15, 0),
        comment: "Price in IDR",
      },
      price_rmb: {
        allowNull: false,
        type: DataTypes.DECIMAL(15, 0),
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
        comment: "Status of ServicePricingVariantSupporting (active/inactive)",
      },
    },
    {
      tableName: "service_pricing_variant_supporting",
      timestamps: true,
      underscored: true,
      indexes: [
        // Prefix index untuk string panjang
        {
          name: "idx_id_service_pricing_supporting",
          fields: ["id_service_pricing_supporting"],
        },
      ],
    }
  );

  // Define associations (untuk future development)
  ServicePricingVariantSupporting.associate = (models) => {
    // Contoh: ServicePricingVariantSupporting dapat memiliki relasi dengan Order, dll
    // ServicePricingVariantSupporting.hasMany(models.Order, { ... });

    ServicePricingVariantSupporting.belongsTo(models.ServicePricingSupporting, {
      foreignKey: "id_service_pricing_supporting",
      as: "service_pricing_supporting",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ServicePricingVariantSupporting;
};
