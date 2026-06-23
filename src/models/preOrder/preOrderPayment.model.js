const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PreOrderPayment = sequelize.define(
    "PreOrderPayment",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Quotation Payment",
      },
      id_pre_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "pre_orders",
          key: "id",
        },
        comment: "Foreign key to pre_orders table",
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
        type: DataTypes.DECIMAL(15, 0),
        allowNull: false,
        comment: "Total payment in IDR",
      },
      total_payment_rmb: {
        type: DataTypes.DECIMAL(15, 0),
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
      tableName: "pre_order_payment",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_pre_order",
          fields: ["id_pre_order"],
        },
      ],
    },
  );

  // Define associations
  PreOrderPayment.associate = (models) => {
    // PreOrderPayment belongs to Quotation
    PreOrderPayment.belongsTo(models.PreOrder, {
      foreignKey: "id_pre_order",
      as: "pre_order",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderPayment has many PreOrder Payment List
    PreOrderPayment.hasMany(models.PreOrderPaymentList, {
      foreignKey: "id_pre_order_payment",
      as: "pre_order_payment_list",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderPayment has many PreOrder Payment Service
    PreOrderPayment.hasMany(models.PreOrderPaymentService, {
      foreignKey: "id_pre_order_payment",
      as: "pre_order_payment_services",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return PreOrderPayment;
};
