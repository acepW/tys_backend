const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ServicePricing = sequelize.define(
    "ServicePricing",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Service Pricing",
      },
      id_category: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "categories",
          key: "id",
        },
        comment: "Id category from category",
      },
      id_division: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "divisions",
          key: "id",
        },
        comment: "Id division from division",
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
      status: {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        defaultValue: "pending",
        comment: "Status",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Service Pricing (active/inactive)",
      },
    },
    {
      tableName: "service_pricing",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_product_name_indo",
          fields: ["product_name_indo"],
        },
        {
          name: "idx_product_name_mandarin",
          fields: ["product_name_mandarin"],
        },
        {
          name: "idx_id_category",
          fields: ["id_category"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    }
  );

  // Define associations (untuk future development)
  ServicePricing.associate = (models) => {
    // Contoh: ServicePricing dapat memiliki relasi dengan Order, dll
    // ServicePricing.hasMany(models.Order, { ... });

    // Service Pricing belongs to Category
    ServicePricing.belongsTo(models.Category, {
      foreignKey: "id_category",
      as: "category",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Service Pricing has many variants
    ServicePricing.hasMany(models.ServicePricingVariant, {
      foreignKey: "id_service_pricing",
      as: "variants",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Service Pricing has one product
    ServicePricing.hasOne(models.Product, {
      foreignKey: "id_service_pricing",
      as: "product",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Service Pricing belongs to division
    ServicePricing.belongsTo(models.Division, {
      foreignKey: "id_division",
      as: "division",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Service Pricing has many variants
    ServicePricing.hasMany(models.QuotationService, {
      foreignKey: "id_service_pricing",
      as: "quotation_services",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ServicePricing;
};
