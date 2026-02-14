const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const QuotationService = sequelize.define(
    "QuotationService",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Quotation Service",
      },
      id_quotation_category: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "quotation_category",
          key: "id",
        },
        comment: "Foreign key to quotation category table",
      },
      id_service_pricing: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "service_pricing",
          key: "id",
        },
        comment: "Foreign key to service pricing table",
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
      qty: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "Qty of service",
      },
      total_price_idr: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "Total price in IDR",
      },
      total_price_rmb: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "Total Price in RMB",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Quotation Category (active/inactive)",
      },
    },
    {
      tableName: "quotation_service",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_quotation_category",
          fields: ["id_quotation_category"],
        },
        {
          name: "idx_id_service_pricing",
          fields: ["id_service_pricing"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    }
  );

  // Define associations
  QuotationService.associate = (models) => {
    // QuotationService belongs to Quotation Category
    QuotationService.belongsTo(models.QuotationCategory, {
      foreignKey: "id_quotation_category",
      as: "quotation_category",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // QuotationService belongs to Service Pricing
    QuotationService.belongsTo(models.ServicePricing, {
      foreignKey: "id_service_pricing",
      as: "service_pricing",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return QuotationService;
};
