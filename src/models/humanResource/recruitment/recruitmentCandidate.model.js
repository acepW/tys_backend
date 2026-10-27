const { DataTypes } = require("sequelize");
const { approvalColumns, associate, tableOptions } = require("./common");

// Database kandidat. A candidate applies to one recruitment request; its company,
// department, division, position and level are copied from that request. Every
// other field is filled by HR; the interview schedules live here so HR can
// reschedule them. The user interview schedule is also set by the HR interview
// when its decision is "passed".
const reference = (table) => ({
  type: DataTypes.INTEGER,
  allowNull: true,
  references: { model: table, key: "id" },
});

module.exports = (sequelize) => {
  const RecruitmentCandidate = sequelize.define(
    "RecruitmentCandidate",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_recruitment_request: {
        ...reference("recruitment_requests"),
        comment: "Required on create; nullable only for candidates created before it",
      },
      id_company: reference("companies"),
      id_division: reference("divisions"),
      id_level: reference("levels"),
      name: { type: DataTypes.STRING(255), allowNull: false },
      phone_number: { type: DataTypes.STRING(50), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
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
      hr_interview_meeting_room: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Meeting room of the HR interview",
      },
      hr_interview_meeting_room_link: {
        type: DataTypes.STRING(1000),
        allowNull: true,
        comment: "Online meeting link of the HR interview",
      },
      user_interview_mechanism: { type: DataTypes.STRING(255), allowNull: true },
      user_interview_date: { type: DataTypes.DATEONLY, allowNull: true },
      user_interview_time: { type: DataTypes.TIME, allowNull: true },
      ...approvalColumns(),
    },
    tableOptions("recruitment_candidates", [{ fields: ["name"] }, { fields: ["id_recruitment_request"] }]),
  );
  RecruitmentCandidate.associate = (models) => {
    associate(RecruitmentCandidate, models, {
      fileableType: "recruitment_candidates",
      fileCategories: ["files_cv", "files_application_form"],
    });
    RecruitmentCandidate.belongsTo(models.RecruitmentRequest, {
      foreignKey: "id_recruitment_request",
      as: "recruitment_request",
    });
    RecruitmentCandidate.belongsTo(models.Company, { foreignKey: "id_company", as: "company" });
    RecruitmentCandidate.belongsTo(models.Position, { foreignKey: "id_position", as: "position" });
    RecruitmentCandidate.belongsTo(models.Department, {
      foreignKey: "id_department",
      as: "department",
    });
    RecruitmentCandidate.belongsTo(models.Division, { foreignKey: "id_division", as: "division" });
    RecruitmentCandidate.belongsTo(models.Level, { foreignKey: "id_level", as: "level" });
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
