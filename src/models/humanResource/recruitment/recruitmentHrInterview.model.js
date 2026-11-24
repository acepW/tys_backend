const { DataTypes } = require("sequelize");
const { approvalColumns, candidateColumns, associate, tableOptions } = require("./common");

// HR interview (2026-11-24, docs/recruitment-interview-requirement.md bagian 3):
// HR schedules it (scheduled), then after the interview fills the attendance and,
// when the candidate came, the psychotests, the report (scores per master item)
// and the recommendation (completed). No approval since 2026-11-24 (H14); the
// result sets the candidate's hiring status.
// pending / approve / reject and decision, psychotest_result, interview_result are
// kept for interviews made before; the migration moved them to the new columns.
const HR_INTERVIEW_STATUSES = ["scheduled", "no show", "completed", "pending", "approve", "reject"];
const INTERVIEW_METHODS = ["online", "offline"];
const ATTENDANCES = ["attended", "no show"];
const HR_RECOMMENDATIONS = ["recommended", "not recommended"];

module.exports = (sequelize) => {
  const RecruitmentHrInterview = sequelize.define(
    "RecruitmentHrInterview",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      ...candidateColumns(),
      interview_date: { type: DataTypes.DATEONLY, allowNull: true },
      interview_time: { type: DataTypes.TIME, allowNull: true },
      method: { type: DataTypes.ENUM(...INTERVIEW_METHODS), allowNull: true, comment: "online / offline" },
      meeting_room: { type: DataTypes.STRING(255), allowNull: true, comment: "Room of an offline interview" },
      meeting_link: { type: DataTypes.STRING(1000), allowNull: true, comment: "Link of an online interview" },
      id_user_interviewer: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "Pewawancara; the HR who scheduled it unless another user is chosen",
      },
      attendance: { type: DataTypes.ENUM(...ATTENDANCES), allowNull: true, comment: "Filled by HR after the interview" },
      recommendation: {
        type: DataTypes.ENUM(...HR_RECOMMENDATIONS),
        allowNull: true,
        comment: "Direkomendasikan / Tidak Direkomendasikan, when the candidate attended",
      },
      description: { type: DataTypes.TEXT, allowNull: true, comment: "Deskripsi of the report" },
      id_user_result: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "Who filled the result",
      },
      result_at: { type: DataTypes.DATE, allowNull: true },
      psychotest_result: { type: DataTypes.TEXT, allowNull: true, comment: "Hasil psikotes (old interviews only)" },
      interview_result: { type: DataTypes.TEXT, allowNull: true, comment: "Hasil wawancara HR (old interviews only)" },
      decision: {
        type: DataTypes.ENUM("passed", "not passed"),
        allowNull: true,
        comment: "Lolos / Tidak Lolos (old interviews only; now recommendation)",
      },
      work_system: { type: DataTypes.STRING(255), allowNull: true, comment: "Sistem kerja" },
      salary: { type: DataTypes.STRING(255), allowNull: true },
      ...approvalColumns(HR_INTERVIEW_STATUSES),
    },
    tableOptions("recruitment_hr_interviews", [{ fields: ["id_recruitment_candidate"] }]),
  );
  RecruitmentHrInterview.associate = (models) => {
    associate(RecruitmentHrInterview, models, {
      fileableType: "recruitment_hr_interviews",
      fileCategories: ["files_attachment"],
      withCandidate: true,
    });
    RecruitmentHrInterview.belongsTo(models.User, { foreignKey: "id_user_interviewer", as: "interviewer" });
    RecruitmentHrInterview.belongsTo(models.User, { foreignKey: "id_user_result", as: "user_result" });
    RecruitmentHrInterview.hasMany(models.RecruitmentPsychotest, {
      foreignKey: "id_recruitment_hr_interview",
      as: "psychotests",
    });
    RecruitmentHrInterview.hasMany(models.RecruitmentInterviewScore, {
      foreignKey: "id_interview",
      constraints: false,
      scope: { interview_type: "hr" },
      as: "scores",
    });
  };
  return RecruitmentHrInterview;
};

module.exports.HR_INTERVIEW_STATUSES = HR_INTERVIEW_STATUSES;
module.exports.INTERVIEW_METHODS = INTERVIEW_METHODS;
module.exports.ATTENDANCES = ATTENDANCES;
module.exports.HR_RECOMMENDATIONS = HR_RECOMMENDATIONS;
