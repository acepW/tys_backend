const { DataTypes } = require("sequelize");

// Master of the interview report form (Laporan Interview), used by both the HR and
// the user interview (docs/recruitment-interview-requirement.md, H7). Items are
// shown in sort_order, grouped by section, then by group when the item has one.
// Each item is rated on REPORT_SCALE. Interviews keep a copy of the section,
// group and item names, so a past report does not change when the master does.
const REPORT_SCALE = [
  { value: "KS", label: "Kurang Sekali" },
  { value: "K", label: "Kurang" },
  { value: "C", label: "Cukup" },
  { value: "B", label: "Baik" },
  { value: "BS", label: "Baik Sekali" },
];

module.exports = (sequelize) => {
  const RecruitmentReportItem = sequelize.define(
    "RecruitmentReportItem",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      section: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "e.g. Gaya Kerja, Pola Kerja, Hasil Interview",
      },
      group_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "e.g. Respon terhadap Lingkungan dan Jobdesk (Grafik I), Faktor Utama; null when the item stands alone",
      },
      group_description: { type: DataTypes.TEXT, allowNull: true },
      item_name: { type: DataTypes.STRING(255), allowNull: false },
      item_description: { type: DataTypes.TEXT, allowNull: true, comment: "Uraian of the item" },
      is_optional: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Marked * in the client's form: may be left unrated",
      },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: "recruitment_report_items",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["is_active", "sort_order"] }],
    },
  );
  return RecruitmentReportItem;
};

module.exports.REPORT_SCALE = REPORT_SCALE;
