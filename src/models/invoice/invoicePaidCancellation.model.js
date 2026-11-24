const { DataTypes } = require("sequelize");

// Cancellation request of an invoice that is already paid (at least 50%) and/or
// whose tax invoice was requested or issued (FAT Internal "Tahapan Cancel Invoice
// yang Sudah Bayar / Terbit Faktur Pajak"; design: docs/invoice-cancellation-paid.md).
// Sales requests it; AR & AP, SPV FAT Internal, the vice director and the director
// approve it in turn; the money above the 50% the company keeps is then moved to
// other invoices/debit notes (credit note) or refunded. Rows are never reused: a
// withdrawn request stays as history and a new request is a new row.

// Only "not processed" may be cancelled; the other two answer the request with
// the rule from the requirement document.
const SERVICE_CONDITIONS = ["not processed", "processed without certificate", "processed with certificate"];
const SETTLEMENTS = ["transfer", "refund", "none"];
const PAID_CANCELLATION_STATUSES = [
  "waiting ar&ap review",
  "waiting outstanding settlement",
  "rejected",
  "waiting spv fat internal approval",
  "waiting vice director approval",
  "waiting director approval",
  "waiting for payment transfer",
  "waiting for refund process",
  "waiting for cashier payment",
  "completed",
  "withdrawn",
];
// Every status but the two final ones: the invoice stays locked.
const OPEN_PAID_CANCELLATION_STATUSES = PAID_CANCELLATION_STATUSES.filter(
  (status) => !["completed", "withdrawn"].includes(status),
);

const money = (comment) => ({
  type: DataTypes.DECIMAL(20, 2),
  allowNull: false,
  defaultValue: 0,
  comment,
});

module.exports = (sequelize) => {
  const InvoicePaidCancellation = sequelize.define(
    "InvoicePaidCancellation",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_invoice: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "invoices", key: "id" },
        comment: "Invoice to cancel",
      },
      invoice_no: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Copy of the invoice number, shown in My Task",
      },
      id_company: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "companies", key: "id" },
      },
      id_customer: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "customers", key: "id" },
      },
      currency_type: {
        type: DataTypes.ENUM("idr", "rmb"),
        allowNull: false,
        defaultValue: "idr",
      },
      service_condition: {
        type: DataTypes.ENUM(...SERVICE_CONDITIONS),
        allowNull: false,
        comment: "Cancellation rule chosen by sales; only not processed is accepted",
      },
      reason: { type: DataTypes.TEXT, allowNull: false, comment: "Reason from sales" },
      previous_status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: "Invoice status before the request, restored when it is withdrawn",
      },
      tax_invoice_status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: "Invoice tax invoice status when requested (issued needs sales' confirmation)",
      },
      id_debit_note: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "debit_notes", key: "id" },
        comment: "Debit note linked to the invoice when requested",
      },
      cancel_debit_note: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Whether the debit note is cancelled too (true) or continues (false), chosen by sales",
      },
      invoice_total: money("Invoice total when requested"),
      invoice_paid: money("Accepted invoice payments when requested"),
      invoice_kept: money("Half the invoice total, kept by the company"),
      invoice_amount: money("Invoice money to transfer or refund: at most paid - kept"),
      debit_note_paid: money("Paid debit note money when requested (debit note cancelled too)"),
      debit_note_amount: money("Debit note money to transfer or refund: all of it, no 50% rule"),
      settlement: {
        type: DataTypes.ENUM(...SETTLEMENTS),
        allowNull: false,
        defaultValue: "none",
        comment: "transfer (credit note), refund (payment request) or none (no money to return)",
      },
      transfer_targets: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "Sales' choice for a transfer: [{ type: invoice|debit_note, id, amount }]; the rest becomes a deposit",
      },
      refund_bank_name: { type: DataTypes.STRING(200), allowNull: true },
      refund_account_name: { type: DataTypes.STRING(200), allowNull: true },
      refund_account_number: { type: DataTypes.STRING(100), allowNull: true },
      tax_invoice_credited: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        comment: "Refund of an invoice with an issued tax invoice: whether the client credited it (needs a tax return note)",
      },
      status: {
        type: DataTypes.ENUM(...PAID_CANCELLATION_STATUSES),
        allowNull: false,
        defaultValue: "waiting ar&ap review",
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Last rejection or hold note",
      },
      id_user_request: { type: DataTypes.INTEGER, allowNull: true, references: { model: "users", key: "id" } },
      id_user_review: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "AR & AP who approved it",
      },
      reviewed_at: { type: DataTypes.DATE, allowNull: true },
      id_user_verify: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "SPV FAT Internal who approved it",
      },
      verified_at: { type: DataTypes.DATE, allowNull: true },
      id_user_vice_approve: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "Vice director who approved it",
      },
      vice_approved_at: { type: DataTypes.DATE, allowNull: true },
      id_user_approve: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "Director who approved it",
      },
      approved_at: { type: DataTypes.DATE, allowNull: true },
      id_payment_request: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "payment_requests", key: "id" },
        comment: "Refund payment request waiting for the cashier (7B); cleared when the cashier rejects it",
      },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: "invoice_paid_cancellations",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "idx_paid_cancellation_invoice", fields: ["id_invoice", "status"] },
        { name: "idx_paid_cancellation_status", fields: ["status", "is_active"] },
        { name: "idx_paid_cancellation_customer", fields: ["id_customer"] },
      ],
    },
  );

  InvoicePaidCancellation.associate = (models) => {
    InvoicePaidCancellation.belongsTo(models.Invoice, { foreignKey: "id_invoice", as: "invoice" });
    InvoicePaidCancellation.belongsTo(models.Company, { foreignKey: "id_company", as: "company" });
    InvoicePaidCancellation.belongsTo(models.Customer, { foreignKey: "id_customer", as: "customer" });
    InvoicePaidCancellation.belongsTo(models.DebitNote, { foreignKey: "id_debit_note", as: "debit_note" });
    for (const [key, as] of [
      ["id_user_request", "user_request"],
      ["id_user_review", "user_review"],
      ["id_user_verify", "user_verify"],
      ["id_user_vice_approve", "user_vice_approve"],
      ["id_user_approve", "user_approve"],
    ])
      InvoicePaidCancellation.belongsTo(models.User, { foreignKey: key, as });
    InvoicePaidCancellation.belongsTo(models.PaymentRequest, {
      foreignKey: "id_payment_request",
      as: "payment_request",
    });
    // Every refund payment request made for it, rejected ones included (7B)
    InvoicePaidCancellation.hasMany(models.PaymentRequest, {
      foreignKey: "id_invoice_paid_cancellation",
      as: "refund_payment_requests",
    });
    // Credit notes opened by the payment transfer (7A)
    InvoicePaidCancellation.hasMany(models.CreditNote, {
      foreignKey: "id_invoice_paid_cancellation",
      as: "credit_notes",
    });
    // transfer_proof: AR & AP's proof of the payment transfer (7A.2)
    for (const category of ["cancellation_attachment", "refund_letter", "tax_return_note", "transfer_proof"])
      InvoicePaidCancellation.hasMany(models.File, {
        foreignKey: "fileable_id",
        constraints: false,
        scope: { fileable_type: "invoice_paid_cancellations", category },
        as: category,
      });
  };

  return InvoicePaidCancellation;
};

module.exports.SERVICE_CONDITIONS = SERVICE_CONDITIONS;
module.exports.SETTLEMENTS = SETTLEMENTS;
module.exports.PAID_CANCELLATION_STATUSES = PAID_CANCELLATION_STATUSES;
module.exports.OPEN_PAID_CANCELLATION_STATUSES = OPEN_PAID_CANCELLATION_STATUSES;
