const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const InvoiceService = sequelize.define(
    "InvoiceService",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Invoice Service",
      },
      id_invoice: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "invoices",
          key: "id",
        },
        comment: "Foreign key to invoices table",
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
      product_name_indo: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "Product name in Indonesian",
      },
      product_name_mandarin: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "Product name in Mandarin",
      },
      price_idr: {
        allowNull: true,
        type: DataTypes.DECIMAL(15, 0),
        comment: "Price in IDR",
      },
      price_rmb: {
        allowNull: true,
        type: DataTypes.DECIMAL(15, 0),
        comment: "Price in RMB",
      },
      qty: {
        allowNull: true,
        type: DataTypes.INTEGER,
        comment: "Qty of service",
      },
      total_price_idr: {
        allowNull: true,
        type: DataTypes.DECIMAL(15, 0),
        comment: "Total price in IDR",
      },
      total_price_rmb: {
        allowNull: true,
        type: DataTypes.DECIMAL(15, 0),
        comment: "Total Price in RMB",
      },
      payment_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "Payment type",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Quotation Category (active/inactive)",
      },
    },
    {
      tableName: "invoice_service",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_invoice",
          fields: ["id_invoice"],
        },
        {
          name: "idx_id_quotation_service",
          fields: ["id_quotation_service"],
        },
      ],
    },
  );

  // Define associations
  InvoiceService.associate = (models) => {
    // InvoiceService belongs to Quotation Service
    InvoiceService.belongsTo(models.QuotationService, {
      foreignKey: "id_quotation_service",
      as: "quotation_service",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // InvoiceService belongs to Invoice
    InvoiceService.belongsTo(models.Invoice, {
      foreignKey: "id_invoice",
      as: "invoice",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return InvoiceService;
};
