const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PreOrderServiceSupporting = sequelize.define(
    "PreOrderServiceSupporting",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for PreOrder Service",
      },
      id_pre_order_category: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "pre_order_category",
          key: "id",
        },
        comment: "Foreign key to pre_order_category table",
      },
      id_service_pricing_supporting: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "service_pricing",
          key: "id",
        },
        comment: "Foreign key to service pricing table",
      },
      id_quotation_service_supporting: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "quotation_service_supporting",
          key: "id",
        },
        comment: "Foreign key to quotation service table",
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
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of PreOrder Category (active/inactive)",
      },
    },
    {
      tableName: "pre_order_service_supporting",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_pre_order_category",
          fields: ["id_pre_order_category"],
        },
        {
          name: "idx_id_service_pricing_supporting",
          fields: ["id_service_pricing_supporting"],
        },
      ],
    },
  );

  // Define associations
  PreOrderServiceSupporting.associate = (models) => {
    // PreOrderServiceSupporting belongs to PreOrder Category
    PreOrderServiceSupporting.belongsTo(models.PreOrderCategory, {
      foreignKey: "id_pre_order_category",
      as: "pre_order_category",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderServiceSupporting belongs to Quotation Service
    PreOrderServiceSupporting.belongsTo(models.QuotationServiceSupporting, {
      foreignKey: "id_quotation_service_supporting",
      as: "quotation_service_supporting",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderServiceSupporting belongs to Service Pricing
    PreOrderServiceSupporting.belongsTo(models.ServicePricing, {
      foreignKey: "id_service_pricing_supporting",
      as: "service_pricing_supporting",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return PreOrderServiceSupporting;
};
