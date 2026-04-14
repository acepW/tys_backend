const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PaymentRequestVerificationProgress = sequelize.define(
    "PaymentRequestVerificationProgress",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Payment Request Verification Progress",
      },
      id_payment_request: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "payment_requests",
          key: "id",
        },
        comment: "Foreign key to payment_requests table",
      },
      id_user: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "Foreign key to users table",
      },

      note: {
        type: DataTypes.TEXT("long"),
        allowNull: true,
        comment: "Description is BAB for Mandarin",
      },
      status: {
        type: DataTypes.ENUM(
          "requested",
          "approve spv",
          "approve fat",
          "approve spv fat",
          "approve manager fat",
          "approve director",
          "reject spv",
          "reject fat",
          "reject spv fat",
          "reject manager fat",
          "reject director",
          "paid",
          "continue_to_debit_note",
        ),
        allowNull: false,
        comment: "status of PaymentRequestVerificationProgress",
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment:
          "Status of PaymentRequestVerificationProgress (active/inactive)",
      },
    },
    {
      tableName: "payment_requests_verification_progress",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_payment_request",
          fields: ["id_payment_request"],
        },
        {
          name: "idx_id_user",
          fields: ["id_user"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  PaymentRequestVerificationProgress.associate = (models) => {
    // Contoh: PaymentRequestVerificationProgress dapat memiliki relasi dengan Order, dll
    // PaymentRequestVerificationProgress.hasMany(models.Order, { ... });

    //Payment Request Verification Progress belongs to Payment Request
    PaymentRequestVerificationProgress.belongsTo(models.PaymentRequest, {
      foreignKey: "id_payment_request",
      as: "payment_request",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Payment Request Verification Progress belongs to User
    PaymentRequestVerificationProgress.belongsTo(models.User, {
      foreignKey: "id_user",
      as: "user",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return PaymentRequestVerificationProgress;
};
