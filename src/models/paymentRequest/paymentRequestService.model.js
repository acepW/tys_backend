const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PaymentRequestService = sequelize.define(
    "PaymentRequestService",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_payment_request: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "payment_requests", key: "id" },
        comment: "Foreign key to payment_requests table",
      },
      type: {
        type: DataTypes.ENUM("vendor", "manual"),
        allowNull: false,
        defaultValue: "manual",
        comment:
          "vendor when taken from a vendor (id_vendor or id_vendor_service filled), manual otherwise",
      },
      id_vendor: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "vendors", key: "id" },
        comment: "Foreign key to vendors table",
      },
      id_vendor_service: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "vendor_services", key: "id" },
        comment: "Foreign key to vendor_services table",
      },
      id_category: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "categories", key: "id" },
        comment: "Foreign key to categories table",
      },
      service_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Service name",
      },
      price_idr: {
        type: DataTypes.DECIMAL(15, 0),
        allowNull: false,
        defaultValue: 0,
        comment: "Price in IDR",
      },
      price_rmb: {
        type: DataTypes.DECIMAL(15, 0),
        allowNull: false,
        defaultValue: 0,
        comment: "Price in RMB",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of service (active/inactive)",
      },
    },
    {
      tableName: "payment_request_services",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_payment_request_service_parent",
          fields: ["id_payment_request"],
        },
      ],
    },
  );

  PaymentRequestService.associate = (models) => {
    PaymentRequestService.belongsTo(models.PaymentRequest, {
      foreignKey: "id_payment_request",
      as: "payment_request",
    });
    PaymentRequestService.belongsTo(models.Vendor, {
      foreignKey: "id_vendor",
      as: "vendor",
    });
    PaymentRequestService.belongsTo(models.VendorService, {
      foreignKey: "id_vendor_service",
      as: "vendor_service",
    });
    PaymentRequestService.belongsTo(models.Category, {
      foreignKey: "id_category",
      as: "category",
    });
  };

  return PaymentRequestService;
};
