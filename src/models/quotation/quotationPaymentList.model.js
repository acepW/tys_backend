const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const QuotationPaymentList = sequelize.define(
    "QuotationPaymentList",
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
      service_name_indo: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Service name in Indonesian",
      },
      service_name_mandarin: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Service name in Mandarin",
      },
      price_idr: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: "Price in IDR",
      },
      price_rmb: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: "Price in RMB",
      },
      payment_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: "Payment type",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Quotation Payment (active/inactive)",
      },
    },
    {
      tableName: "quotation_payment_list",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_quotation_payment",
          fields: ["id_quotation_payment"],
        },
      ],
    },
  );

  // Define associations
  QuotationPaymentList.associate = (models) => {
    // QuotationPaymentList belongs to Quotation
    QuotationPaymentList.belongsTo(models.QuotationPayment, {
      foreignKey: "id_quotation_payment",
      as: "quotation_payment",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // QuotationPaymentList has many Quotation Payment Service
    QuotationPaymentList.hasMany(models.QuotationPaymentService, {
      foreignKey: "id_quotation_payment_list",
      as: "quotation_payment_services",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return QuotationPaymentList;
};
