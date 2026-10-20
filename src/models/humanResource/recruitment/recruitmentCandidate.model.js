const { DataTypes } = require("sequelize");
const { approvalColumns, associate, tableOptions } = require("./common");

// Database kandidat. Every field is filled by HR; the interview schedules live
// here so HR can reschedule them. The user interview schedule is also set by the
// HR interview when its decision is "passed".
module.exports = (sequelize) => {
  const RecruitmentCandidate = sequelize.define(
    "RecruitmentCandidate",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      job_title: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Jabatan (free text)",
      },
      id_position: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "positions", key: "id" },
      },
      id_department: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "departments", key: "id" },
      },
      source: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Sumber kandidat, e.g. JobStreet, referral",
      },
      disc: { type: DataTypes.TEXT, allowNull: true, comment: "DISC test result" },
      recruitment_process: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Proses rekrutmen (free text)",
      },
      hr_interview_mechanism: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "e.g. Online, Onsite",
      },
      hr_interview_date: { type: DataTypes.DATEONLY, allowNull: true },
      hr_interview_time: { type: DataTypes.TIME, allowNull: true },
      user_interview_mechanism: { type: DataTypes.STRING(255), allowNull: true },
      user_interview_date: { type: DataTypes.DATEONLY, allowNull: true },
      user_interview_time: { type: DataTypes.TIME, allowNull: true },
      ...approvalColumns(),
    },
    tableOptions("recruitment_candidates", [{ fields: ["name"] }]),
  );
  RecruitmentCandidate.associate = (models) => {
    associate(RecruitmentCandidate, models, {
      fileableType: "recruitment_candidates",
      fileCategories: ["files_cv", "files_application_form"],
    });
    RecruitmentCandidate.belongsTo(models.Position, { foreignKey: "id_position", as: "position" });
    RecruitmentCandidate.belongsTo(models.Department, {
      foreignKey: "id_department",
      as: "department",
    });
    for (const [modelName, as] of [
      ["RecruitmentHrInterview", "hr_interviews"],
      ["RecruitmentUserInterview", "user_interviews"],
      ["RecruitmentOffering", "offerings"],
      ["RecruitmentContract", "contracts"],
    ])
      RecruitmentCandidate.hasMany(models[modelName], {
        foreignKey: "id_recruitment_candidate",
        as,
      });
  };
  return RecruitmentCandidate;
};
