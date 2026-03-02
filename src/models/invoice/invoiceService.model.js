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
