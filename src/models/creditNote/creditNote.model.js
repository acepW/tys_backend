const { DataTypes } = require("sequelize");

// Credit note opened by AR & AP when a paid invoice (or its debit note) is
// cancelled with a payment transfer (FAT Internal 7A; docs/invoice-cancellation-paid.md R8).
// One per cancelled document that has money to move: invoice money only goes to
// invoices and debit note money only to debit notes. What is allocated right away
// pays outstanding documents of the same customer (credit note non deposit); the
// rest stays as the deposit balance for later invoices (credit note deposit).
const CREDIT_NOTE_SOURCES = ["invoice", "debit_note"];

module.exports = (sequelize) => {
  const CreditNote = sequelize.define(
    "CreditNote",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      credit_note_no: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "001/CN/{initial company}/{roman month}/{year}, per company per year",
      },
      id_company: { type: DataTypes.INTEGER, allowNull: false, references: { model: "companies", key: "id" } },
      id_customer: { type: DataTypes.INTEGER, allowNull: false, references: { model: "customers", key: "id" } },
      currency_type: { type: DataTypes.ENUM("idr", "rmb"), allowNull: false, defaultValue: "idr" },
      source_type: {
        type: DataTypes.ENUM(...CREDIT_NOTE_SOURCES),
        allowNull: false,
        comment: "Cancelled document the money comes from; it may only go to the same kind",
      },
      id_invoice: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "invoices", key: "id" },
        comment: "Cancelled invoice (source_type invoice), or the invoice of the cancelled debit note",
      },
      id_debit_note: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "debit_notes", key: "id" },
        comment: "Cancelled debit note (source_type debit_note)",
      },
      id_invoice_paid_cancellation: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "invoice_paid_cancellations", key: "id" },
      },
      date: { type: DataTypes.DATE, allowNull: false, comment: "Date AR & AP opened it" },
      amount: { type: DataTypes.DECIMAL(20, 2), allowNull: false, comment: "Money moved off the cancelled document" },
      balance: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: false,
        comment: "Deposit left after the allocations; reports compute it from the allocations by date",
      },
      note: { type: DataTypes.TEXT, allowNull: true },
      id_user_create: { type: DataTypes.INTEGER, allowNull: true, references: { model: "users", key: "id" } },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: "credit_notes",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "uq_credit_note_no", unique: true, fields: ["credit_note_no"] },
        { name: "idx_credit_note_customer", fields: ["id_customer", "id_company", "currency_type", "source_type"] },
        { name: "idx_credit_note_cancellation", fields: ["id_invoice_paid_cancellation"] },
      ],
    },
  );

  CreditNote.associate = (models) => {
    CreditNote.belongsTo(models.Company, { foreignKey: "id_company", as: "company" });
    CreditNote.belongsTo(models.Customer, { foreignKey: "id_customer", as: "customer" });
    CreditNote.belongsTo(models.Invoice, { foreignKey: "id_invoice", as: "invoice" });
    CreditNote.belongsTo(models.DebitNote, { foreignKey: "id_debit_note", as: "debit_note" });
    CreditNote.belongsTo(models.InvoicePaidCancellation, {
      foreignKey: "id_invoice_paid_cancellation",
      as: "paid_cancellation",
    });
    CreditNote.belongsTo(models.User, { foreignKey: "id_user_create", as: "user_create" });
    CreditNote.hasMany(models.CreditNoteAllocation, { foreignKey: "id_credit_note", as: "allocations" });
  };

  return CreditNote;
};

module.exports.CREDIT_NOTE_SOURCES = CREDIT_NOTE_SOURCES;
