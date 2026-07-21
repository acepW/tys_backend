const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const QuotationServiceSupporting = sequelize.define(
    "QuotationServiceSupporting",
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
      id_service_pricing_supporting: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "service_pricing_supporting",
          key: "id",
        },
        comment: "Foreign key to service pricing supporting table",
      },
      id_service_pricing_variant_supporting: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "service_pricing_variant_supporting",
          key: "id",
        },
        comment: "Foreign key to service pricing variant supporting table",
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
        type: DataTypes.DECIMAL(15, 0),
        comment: "Price in IDR",
      },
      price_rmb: {
        allowNull: false,
        type: DataTypes.DECIMAL(15, 0),
        comment: "Price in RMB",
      },
      qty: {
        allowNull: false,
        type: DataTypes.INTEGER,
        comment: "Qty of service",
      },
      total_price_idr: {
        allowNull: false,
        type: DataTypes.DECIMAL(15, 0),
        comment: "Total price in IDR",
      },
      total_price_rmb: {
        allowNull: false,
        type: DataTypes.DECIMAL(15, 0),
        comment: "Total Price in RMB",
      },
      index: {
        allowNull: true,
        type: DataTypes.INTEGER,
        comment: "index of service",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Quotation Category (active/inactive)",
      },
    },
    {
      tableName: "quotation_service_supporting",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_quotation_category",
          fields: ["id_quotation_category"],
        },
        {
          name: "idx_id_service_pricing_supporting",
          fields: ["id_service_pricing_supporting"],
        },
      ],
    }
  );

  // Define associations
  QuotationServiceSupporting.associate = (models) => {
    // QuotationServiceSupporting belongs to Quotation Category
    QuotationServiceSupporting.belongsTo(models.QuotationCategory, {
      foreignKey: "id_quotation_category",
      as: "quotation_category",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // QuotationServiceSupporting belongs to Service Pricing supporting
    QuotationServiceSupporting.belongsTo(models.ServicePricingSupporting, {
      foreignKey: "id_service_pricing_supporting",
      as: "service_pricing_supporting",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return QuotationServiceSupporting;
};
