const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ServicePricingSupporting = sequelize.define(
    "ServicePricingSupporting",
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
      product_name_indo: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Product name in Indonesian",
      },
      product_name_mandarin: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Product name in Mandarin",
      },
      note_indo: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
        comment: "Note in Indonesian",
      },
      note_mandarin: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
        comment: "Note in Mandarin",
      },
      required_document: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
        comment: "Required document",
      },
      processing_time: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Processing time",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Service Pricing (active/inactive)",
      },
    },
    {
      tableName: "service_pricing_supporting",
      timestamps: true,
      underscored: true,
      indexes: [
        // Prefix index untuk string panjang
        {
          name: "idx_product_name_indo",
          fields: [{ name: "product_name_indo", length: 100 }],
        },
        {
          name: "idx_product_name_mandarin",
          fields: [{ name: "product_name_mandarin", length: 100 }],
        },

        // Composite index (lebih efisien dari is_active standalone)
        {
          name: "idx_service_pricing_active",
          fields: ["id_service_pricing", "is_active"],
        },
      ],
    }
  );

  // Define associations (untuk future development)
  ServicePricingSupporting.associate = (models) => {
    // Contoh: ServicePricingSupporting dapat memiliki relasi dengan Order, dll
    // ServicePricingSupporting.hasMany(models.Order, { ... });

    //Service Pricing has many variants
    ServicePricingSupporting.belongsTo(models.ServicePricing, {
      foreignKey: "id_service_pricing",
      as: "service_pricing",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    //Service Pricing has many variants
    ServicePricingSupporting.hasMany(models.ServicePricingVariantSupporting, {
      foreignKey: "id_service_pricing_supporting",
      as: "variants_supporting",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ServicePricingSupporting;
};
