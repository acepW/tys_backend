const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const QuotationPayment = sequelize.define(
    "QuotationPayment",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Quotation Payment",
      },
      id_quotation: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "quotations",
          key: "id",
        },
        comment: "Foreign key to quotations table",
      },
      payment_time_indo: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Payment time in Indonesian",
      },
      payment_time_mandarin: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Payment time in Mandarin",
      },
      total_payment_idr: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: "Total payment in IDR",
      },
      total_payment_rmb: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: "Total payment in RMB",
      },
      currency_type: {
        type: DataTypes.ENUM("idr", "rmb"),
        allowNull: false,
        comment: "Currency type",
      },
      payment_to: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Payment to (example:payment_to : 1)",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Quotation Payment (active/inactive)",
      },
    },
    {
      tableName: "quotation_payment",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_quotation",
          fields: ["id_quotation"],
        },
      ],
    },
  );

  // Define associations
  QuotationPayment.associate = (models) => {
    // QuotationPayment belongs to Quotation
    QuotationPayment.belongsTo(models.Quotation, {
      foreignKey: "id_quotation",
      as: "quotation",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // QuotationPayment has many Quotation Payment List
    QuotationPayment.hasMany(models.QuotationPaymentList, {
      foreignKey: "id_quotation_payment",
      as: "quotation_payment_list",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // QuotationPayment has many Quotation Payment Service
    QuotationPayment.hasMany(models.QuotationPaymentService, {
      foreignKey: "id_quotation_payment",
      as: "quotation_payment_services",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return QuotationPayment;
};
