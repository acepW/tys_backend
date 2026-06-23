const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PreOrderPaymentList = sequelize.define(
    "PreOrderPaymentList",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for PreOrder Payment",
      },
      id_pre_order_payment: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "pre_order_payment",
          key: "id",
        },
        comment: "Foreign key to pre_order_payment table",
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
        type: DataTypes.DECIMAL(15, 0),
        allowNull: false,
        comment: "Price in IDR",
      },
      price_rmb: {
        type: DataTypes.DECIMAL(15, 0),
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
      tableName: "pre_order_payment_list",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_pre_order_payment",
          fields: ["id_pre_order_payment"],
        },
      ],
    },
  );

  // Define associations
  PreOrderPaymentList.associate = (models) => {
    // PreOrderPaymentList belongs to PreOrderPayment
    PreOrderPaymentList.belongsTo(models.PreOrderPayment, {
      foreignKey: "id_pre_order_payment",
      as: "pre_order_payment",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderPaymentList has many PreOrder Payment Service
    PreOrderPaymentList.hasMany(models.PreOrderPaymentService, {
      foreignKey: "id_pre_order_payment_list",
      as: "pre_order_payment_services",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return PreOrderPaymentList;
};
