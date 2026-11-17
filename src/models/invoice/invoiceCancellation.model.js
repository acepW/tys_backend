const { DataTypes } = require("sequelize");

// Cancellation request of an unpaid proforma invoice (FAT Internal point 6–6.3).
// Sales asks for a full cancel or a conversion to 50%; AR & AP, SPV FAT Internal
// and the director approve it in turn. Rows are never reused: a rejected request
// stays as history and a new request is a new row.
const CANCELLATION_TYPES = ["cancel", "convert"];
// requested -> reviewed (AR & AP) -> verified (SPV FAT Internal) -> approved
// (director); rejected at any step.
const CANCELLATION_STATUSES = ["requested", "reviewed", "verified", "approved", "rejected"];
const OPEN_CANCELLATION_STATUSES = ["requested", "reviewed", "verified"];

module.exports = (sequelize) => {
  const InvoiceCancellation = sequelize.define(
    "InvoiceCancellation",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_invoice: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "invoices", key: "id" },
        comment: "Invoice to cancel or convert",
      },
      type: {
        type: DataTypes.ENUM(...CANCELLATION_TYPES),
        allowNull: false,
        comment: "cancel: the whole invoice; convert: replaced by a new invoice of 50%",
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "Reason from sales",
      },
      cancel_debit_note: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Whether the debit note linked to the invoice is cancelled too, chosen by sales",
      },
      status: {
        type: DataTypes.ENUM(...CANCELLATION_STATUSES),
        allowNull: false,
        defaultValue: "requested",
        comment: "requested, reviewed (AR & AP), verified (SPV FAT Internal), approved (director) or rejected",
      },
      reject_note: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Why the request was rejected",
      },
      id_invoice_new: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "invoices", key: "id" },
        comment: "Invoice of 50% created when a conversion is approved",
      },
      id_user_request: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "Sales who requested it",
      },
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
      id_user_approve: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "Director who approved it",
      },
      approved_at: { type: DataTypes.DATE, allowNull: true },
      id_user_reject: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "Who rejected it",
      },
      rejected_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "invoice_cancellations",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "idx_invoice_cancellation_invoice", fields: ["id_invoice", "status"] },
      ],
    },
  );

  InvoiceCancellation.associate = (models) => {
    InvoiceCancellation.belongsTo(models.Invoice, { foreignKey: "id_invoice", as: "invoice" });
    InvoiceCancellation.belongsTo(models.Invoice, { foreignKey: "id_invoice_new", as: "invoice_new" });
    for (const [key, as] of [
      ["id_user_request", "user_request"],
      ["id_user_review", "user_review"],
      ["id_user_verify", "user_verify"],
      ["id_user_approve", "user_approve"],
      ["id_user_reject", "user_reject"],
    ])
      InvoiceCancellation.belongsTo(models.User, { foreignKey: key, as });
    // Client request or approval proof
    InvoiceCancellation.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: "invoice_cancellations", category: "cancellation_attachment" },
      as: "cancellation_attachment",
    });
  };

  return InvoiceCancellation;
};

module.exports.CANCELLATION_TYPES = CANCELLATION_TYPES;
module.exports.CANCELLATION_STATUSES = CANCELLATION_STATUSES;
module.exports.OPEN_CANCELLATION_STATUSES = OPEN_CANCELLATION_STATUSES;
