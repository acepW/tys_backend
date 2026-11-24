const { DataTypes } = require("sequelize");

// Use of a credit note: money paid to an invoice or debit note of the same
// customer. transfer: allocated when the credit note was opened (7A); deposit:
// paid later from the deposit balance (fase E). An invoice payment row records
// the money on the invoice; a debit note is paid in full.
const ALLOCATION_TYPES = ["transfer", "deposit"];
const ALLOCATION_TARGETS = ["invoice", "debit_note"];

module.exports = (sequelize) => {
  const CreditNoteAllocation = sequelize.define(
    "CreditNoteAllocation",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_credit_note: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "credit_notes", key: "id" },
      },
      type: { type: DataTypes.ENUM(...ALLOCATION_TYPES), allowNull: false, defaultValue: "transfer" },
      target_type: { type: DataTypes.ENUM(...ALLOCATION_TARGETS), allowNull: false },
      id_invoice: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "invoices", key: "id" },
        comment: "Invoice paid (target_type invoice)",
      },
      id_debit_note: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "debit_notes", key: "id" },
        comment: "Debit note paid (target_type debit_note)",
      },
      id_invoice_payment: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "invoice_payments", key: "id" },
        comment: "Accepted payment it created on the invoice",
      },
      amount: { type: DataTypes.DECIMAL(20, 2), allowNull: false },
      date: { type: DataTypes.DATE, allowNull: false },
      note: { type: DataTypes.TEXT, allowNull: true },
      id_user_create: { type: DataTypes.INTEGER, allowNull: true, references: { model: "users", key: "id" } },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: "credit_note_allocations",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "idx_cn_allocation_credit_note", fields: ["id_credit_note"] },
        { name: "idx_cn_allocation_invoice", fields: ["id_invoice"] },
        { name: "idx_cn_allocation_debit_note", fields: ["id_debit_note"] },
      ],
    },
  );

  CreditNoteAllocation.associate = (models) => {
    CreditNoteAllocation.belongsTo(models.CreditNote, { foreignKey: "id_credit_note", as: "credit_note" });
    CreditNoteAllocation.belongsTo(models.Invoice, { foreignKey: "id_invoice", as: "invoice" });
    CreditNoteAllocation.belongsTo(models.DebitNote, { foreignKey: "id_debit_note", as: "debit_note" });
    CreditNoteAllocation.belongsTo(models.InvoicePayment, { foreignKey: "id_invoice_payment", as: "invoice_payment" });
    CreditNoteAllocation.belongsTo(models.User, { foreignKey: "id_user_create", as: "user_create" });
    // Payment proof on the target document (7A.3)
    CreditNoteAllocation.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: "credit_note_allocations", category: "payment_proof" },
      as: "payment_proof",
    });
  };

  return CreditNoteAllocation;
};

module.exports.ALLOCATION_TYPES = ALLOCATION_TYPES;
module.exports.ALLOCATION_TARGETS = ALLOCATION_TARGETS;
