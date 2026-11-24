const { DataTypes } = require("sequelize");
const { approvalColumns, candidateColumns, associate, tableOptions } = require("./common");

// User interview (2026-11-24, docs/recruitment-interview-requirement.md bagian 4):
// HR schedules it with one or more interviewers (recruitment_user_interviewers),
// each with their own schedule. HR fills each interviewer's attendance; each
// interviewer fills a report and a decision. The candidate's result (H5): a no
// show ends it (no show); once every interviewer decided, any not accepted →
// not accepted, else any considered → considered (kept 14 days, H6), else
// accepted (completed). No approval since 2026-11-24 (H14).
// pending / approve / reject and decision, assessment are kept for interviews made
// before; the migration moved them to the new columns and an interviewer row.
const USER_INTERVIEW_STATUSES = ["scheduled", "no show", "completed", "pending", "approve", "reject"];
const USER_DECISIONS = ["accepted", "considered", "not accepted"];

module.exports = (sequelize) => {
  const RecruitmentUserInterview = sequelize.define(
    "RecruitmentUserInterview",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      ...candidateColumns(),
      result: {
        type: DataTypes.ENUM(...USER_DECISIONS),
        allowNull: true,
        comment: "Candidate's result once every interviewer decided (H5); considered may still change",
      },
      consideration_due_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: "End of the 14 days a considered candidate is kept (H6)",
      },
      result_at: { type: DataTypes.DATE, allowNull: true },
      assessment: { type: DataTypes.TEXT, allowNull: true, comment: "Penilaian user (old interviews only)" },
      decision: {
        type: DataTypes.ENUM("accepted", "not accepted"),
        allowNull: true,
        comment: "Diterima / Ditolak (old interviews only; now result)",
      },
      recommended_salary: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      recommended_benefit: { type: DataTypes.TEXT, allowNull: true },
      active_work_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: "Tanggal aktif kerja, default of the offering",
      },
      ...approvalColumns(USER_INTERVIEW_STATUSES),
    },
    tableOptions("recruitment_user_interviews", [{ fields: ["id_recruitment_candidate"] }]),
  );
  RecruitmentUserInterview.associate = (models) => {
    associate(RecruitmentUserInterview, models, { withCandidate: true });
    RecruitmentUserInterview.hasMany(models.RecruitmentUserInterviewer, {
      foreignKey: "id_recruitment_user_interview",
      as: "interviewers",
    });
  };
  return RecruitmentUserInterview;
};

module.exports.USER_INTERVIEW_STATUSES = USER_INTERVIEW_STATUSES;
module.exports.USER_DECISIONS = USER_DECISIONS;
