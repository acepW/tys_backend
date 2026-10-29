const { DataTypes } = require("sequelize");

// One payment proof uploaded by sales for an invoice. Rows are never overwritten:
// a rejected proof stays as history and the re-upload is a new row. Accepted rows
// add up to the paid amount, so an invoice can be paid in several parts.
module.exports = (sequelize) => {
  const InvoicePayment = sequelize.define(
    "InvoicePayment",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Invoice Payment",
      },
      id_invoice: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "invoices", key: "id" },
        comment: "Foreign key to invoices table",
      },
      amount: {
        type: DataTypes.DECIMAL(15, 0),
        allowNull: false,
        comment: "Paid amount (nominal)",
      },
      transfer_date: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: "Transfer date (tanggal transfer)",
      },
      bank_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
        comment: "Receiving bank (nama bank penerima); required for transfers",
      },
      payment_method: {
        type: DataTypes.ENUM("transfer", "cash"),
        allowNull: false,
        defaultValue: "transfer",
        comment: "Payment method",
      },
      status: {
        type: DataTypes.ENUM("verification", "accepted", "rejected"),
        allowNull: false,
        defaultValue: "verification",
        comment: "AR & AP verification result",
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Note from sales",
      },
      verification_note: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "AR & AP comment; required when the proof is rejected",
      },
      id_user_create: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "Sales who uploaded the proof",
      },
      id_user_verify: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "AR & AP who accepted or rejected the proof",
      },
      verified_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "When the proof was accepted or rejected",
      },
    },
    {
      tableName: "invoice_payments",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "idx_invoice_payment_invoice", fields: ["id_invoice"] },
        { name: "idx_invoice_payment_status", fields: ["id_invoice", "status"] },
      ],
    },
  );

  InvoicePayment.associate = (models) => {
    InvoicePayment.belongsTo(models.Invoice, {
      foreignKey: "id_invoice",
      as: "invoice",
    });
    InvoicePayment.belongsTo(models.User, {
      foreignKey: "id_user_create",
      as: "user_create",
    });
    InvoicePayment.belongsTo(models.User, {
      foreignKey: "id_user_verify",
      as: "user_verify",
    });
    InvoicePayment.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: "invoice_payments", category: "payment_proof" },
      as: "payment_proof",
    });
  };

  return InvoicePayment;
};
