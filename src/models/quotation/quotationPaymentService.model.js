const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const QuotationPaymentService = sequelize.define(
    "QuotationPaymentService",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Quotation Payment",
      },
      id_quotation_payment: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "quotation_payment",
          key: "id",
        },
        comment: "Foreign key to quotations payment table",
      },
      id_quotation_payment_list: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "quotation_payment_list",
          key: "id",
        },
        comment: "Foreign key to quotations payment list table",
      },
      id_quotation_service: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "quotation_service",
          key: "id",
        },
        comment: "Foreign key to quotations service table",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Quotation Payment (active/inactive)",
      },
    },
    {
      tableName: "quotation_payment_service",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_quotation_payment",
          fields: ["id_quotation_payment"],
        },
        {
          name: "idx_id_quotation_payment_list",
          fields: ["id_quotation_payment_list"],
        },
        {
          name: "idx_id_quotation_service",
          fields: ["id_quotation_service"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    },
  );

  // Define associations
  QuotationPaymentService.associate = (models) => {
    // QuotationPaymentService belongs to Quotation payment
    QuotationPaymentService.belongsTo(models.QuotationPayment, {
      foreignKey: "id_quotation_payment",
      as: "quotation_payment",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // QuotationPaymentService belongs to Quotation payment list
    QuotationPaymentService.belongsTo(models.QuotationPaymentList, {
      foreignKey: "id_quotation_payment_list",
      as: "quotation_payment_list",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // QuotationPaymentService belongs to Quotation service
    QuotationPaymentService.belongsTo(models.QuotationService, {
      foreignKey: "id_quotation_service",
      as: "quotation_service",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return QuotationPaymentService;
};
