const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PreOrderService = sequelize.define(
    "PreOrderService",
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
      id_service_pricing: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "service_pricing",
          key: "id",
        },
        comment: "Foreign key to service pricing table",
      },
      id_quotation_service: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "quotation_service",
          key: "id",
        },
        comment: "Foreign key to quotation service table",
      },
      id_contract_service: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "contract_service",
          key: "id",
        },
        comment: "Foreign key to contract service table",
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
      tableName: "pre_order_service",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_pre_order_category",
          fields: ["id_pre_order_category"],
        },
        {
          name: "idx_id_service_pricing",
          fields: ["id_service_pricing"],
        },
      ],
    },
  );

  // Define associations
  PreOrderService.associate = (models) => {
    // PreOrderService belongs to PreOrder Category
    PreOrderService.belongsTo(models.PreOrderCategory, {
      foreignKey: "id_pre_order_category",
      as: "pre_order_category",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderService belongs to Quotation Service
    PreOrderService.belongsTo(models.QuotationService, {
      foreignKey: "id_quotation_service",
      as: "quotation_service",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderService belongs to Contract Service
    PreOrderService.belongsTo(models.ContractService, {
      foreignKey: "id_contract_service",
      as: "contract_service",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderService belongs to Service Pricing
    PreOrderService.belongsTo(models.ServicePricing, {
      foreignKey: "id_service_pricing",
      as: "service_pricing",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderService has many PreOrder Products
    PreOrderService.hasMany(models.PreOrderProduct, {
      foreignKey: "id_pre_order_service",
      as: "products",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return PreOrderService;
};
