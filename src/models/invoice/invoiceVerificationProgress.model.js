const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const InvoiceVerificationProgress = sequelize.define(
    "InvoiceVerificationProgress",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Invoice Verification Progress",
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
        comment: "Description",
      },
      status: {
        type: DataTypes.ENUM(
          "created",
          "submitted",
          "on verification",
          "rejected",
          "approved",
          "paid off",
        ),
        allowNull: false,
        comment: "Status of Invoice Progress",
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of InvoiceVerificationProgress (active/inactive)",
      },
    },
    {
      tableName: "invoice_verification_progress",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_invoice",
          fields: ["id_invoice"],
        },
        {
          name: "idx_id_user",
          fields: ["id_user"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  InvoiceVerificationProgress.associate = (models) => {
    // Contoh: InvoiceVerificationProgress dapat memiliki relasi dengan Order, dll
    // InvoiceVerificationProgress.hasMany(models.Order, { ... });

    //Invoice Verification Progress belongs to Invoice
    InvoiceVerificationProgress.belongsTo(models.Invoice, {
      foreignKey: "id_invoice",
      as: "invoice",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Invoice Verification Progress belongs to User
    InvoiceVerificationProgress.belongsTo(models.User, {
      foreignKey: "id_user",
      as: "user",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return InvoiceVerificationProgress;
};
