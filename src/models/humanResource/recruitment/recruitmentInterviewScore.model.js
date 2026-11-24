const { DataTypes } = require("sequelize");
const { REPORT_SCALE } = require("./recruitmentReportItem.model");

// One rated item of an interview report (Laporan Interview). interview_type tells
// where id_interview points: an HR interview (hr) or one interviewer of a user
// interview (user). The section, group and item names are copied from the master
// when the report is filled, so the report stays as it was if the master changes.
const INTERVIEW_TYPES = ["hr", "user"];

module.exports = (sequelize) => {
  const RecruitmentInterviewScore = sequelize.define(
    "RecruitmentInterviewScore",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      interview_type: { type: DataTypes.ENUM(...INTERVIEW_TYPES), allowNull: false },
      id_interview: { type: DataTypes.INTEGER, allowNull: false },
      id_report_item: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "recruitment_report_items", key: "id" },
      },
      section: { type: DataTypes.STRING(255), allowNull: false },
      group_name: { type: DataTypes.STRING(255), allowNull: true },
      item_name: { type: DataTypes.STRING(255), allowNull: false },
      is_optional: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      score: {
        type: DataTypes.ENUM(...REPORT_SCALE.map((option) => option.value)),
        allowNull: true,
        comment: "KS / K / C / B / BS; null for an optional item left unrated",
      },
    },
    {
      tableName: "recruitment_interview_scores",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["interview_type", "id_interview"] }],
    },
  );
  return RecruitmentInterviewScore;
};

module.exports.INTERVIEW_TYPES = INTERVIEW_TYPES;
