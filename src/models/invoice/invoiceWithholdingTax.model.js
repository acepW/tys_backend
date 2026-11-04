const { DataTypes } = require("sequelize");

// PPh types the client withholds and must send a receipt (bukti potong) for.
// PP 20 needs no receipt.
const WHT_TYPES = ["pph_23", "pph_4_ayat_2"];
const WHT_STATUSES = ["waiting", "verification", "rejected", "clear"];
// What AR & AP checks on a receipt before accepting it; every item must pass.
const WHT_CHECKLIST = [
  "recipient_npwp", // Identitas NPWP penerima penghasilan
  "withholder_npwp", // Identitas NPWP pemotong pajak
  "receipt_no", // Nomor bukti potong
  "tax_period", // Masa pajak bukti potong
  "receipt_date", // Tanggal bukti potong
  "dpp", // Dasar pengenaan pajak
  "rate", // Tarif pajak
  "amount", // Nilai PPh dipotong
  "reference_date", // Tanggal dokumen referensi
  "reference_no", // Nomor dokumen referensi
];

// One withholding tax receipt per PPh type of a paid-off invoice. DPP, rate and
// amount come from the invoice; AR & AP fills the receipt number, tax period and
// date when accepting it. A rejected receipt is uploaded again on the same row.
module.exports = (sequelize) => {
  const InvoiceWithholdingTax = sequelize.define(
    "InvoiceWithholdingTax",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_invoice: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "invoices", key: "id" },
      },
      tax_type: {
        type: DataTypes.ENUM(...WHT_TYPES),
        allowNull: false,
      },
      dpp: {
        type: DataTypes.DECIMAL(15, 0),
        allowNull: false,
        comment: "Tax base (DPP), the invoice sub total",
      },
      rate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        comment: "Tax rate (%) from the tax master when the invoice was paid off",
      },
      amount: {
        type: DataTypes.DECIMAL(15, 0),
        allowNull: false,
        comment: "Withheld PPh, from the invoice",
      },
      status: {
        type: DataTypes.ENUM(...WHT_STATUSES),
        allowNull: false,
        defaultValue: "waiting",
      },
      receipt_no: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Receipt number (nomor bukti potong), filled by AR & AP on accept",
      },
      tax_period: {
        type: DataTypes.STRING(7),
        allowNull: true,
        comment: "Tax period (masa pajak) as MM-YYYY, filled by AR & AP on accept",
      },
      receipt_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: "Receipt date (tanggal bukti potong), filled by AR & AP on accept",
      },
      checklist: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "AR & AP verification checklist, one boolean per WHT_CHECKLIST item",
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Note from sales on the last upload",
      },
      note_reject: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "AR & AP comment on the last rejection",
      },
      id_user_upload: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      id_user_verify: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      uploaded_at: { type: DataTypes.DATE, allowNull: true },
      verified_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "invoice_withholding_taxes",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_invoice_wht_invoice_type",
          unique: true,
          fields: ["id_invoice", "tax_type"],
        },
        { name: "idx_invoice_wht_status", fields: ["status"] },
      ],
    },
  );

  InvoiceWithholdingTax.associate = (models) => {
    InvoiceWithholdingTax.belongsTo(models.Invoice, {
      foreignKey: "id_invoice",
      as: "invoice",
    });
    InvoiceWithholdingTax.belongsTo(models.User, {
      foreignKey: "id_user_upload",
      as: "user_upload",
    });
    InvoiceWithholdingTax.belongsTo(models.User, {
      foreignKey: "id_user_verify",
      as: "user_verify",
    });
    InvoiceWithholdingTax.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: {
        fileable_type: "invoice_withholding_taxes",
        category: "withholding_tax_receipt",
      },
      as: "withholding_tax_receipt",
    });
  };

  return InvoiceWithholdingTax;
};

module.exports.WHT_TYPES = WHT_TYPES;
module.exports.WHT_STATUSES = WHT_STATUSES;
module.exports.WHT_CHECKLIST = WHT_CHECKLIST;
