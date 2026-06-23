const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PreOrderPaymentService = sequelize.define(
    "PreOrderPaymentService",
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
      id_pre_order_payment_list: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "pre_order_payment_list",
          key: "id",
        },
        comment: "Foreign key to pre_order_payment_list table",
      },
      id_pre_order_service: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "pre_order_service",
          key: "id",
        },
        comment: "Foreign key to pre_order_service table",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Quotation Payment (active/inactive)",
      },
    },
    {
      tableName: "pre_order_payment_service",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_pre_order_payment",
          fields: ["id_pre_order_payment"],
        },
        {
          name: "idx_id_pre_order_payment_list",
          fields: ["id_pre_order_payment_list"],
        },
        {
          name: "idx_id_pre_order_service",
          fields: ["id_pre_order_service"],
        },
      ],
    },
  );

  // Define associations
  PreOrderPaymentService.associate = (models) => {
    // PreOrderPaymentService belongs to PreOrder payment
    PreOrderPaymentService.belongsTo(models.PreOrderPayment, {
      foreignKey: "id_pre_order_payment",
      as: "pre_order_payment",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderPaymentService belongs to PreOrder payment list
    PreOrderPaymentService.belongsTo(models.PreOrderPaymentList, {
      foreignKey: "id_pre_order_payment_list",
      as: "pre_order_payment_list",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderPaymentService belongs to PreOrder service
    PreOrderPaymentService.belongsTo(models.PreOrderService, {
      foreignKey: "id_pre_order_service",
      as: "pre_order_service",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return PreOrderPaymentService;
};
