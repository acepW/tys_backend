const { DataTypes } = require("sequelize");
const { associate, tableOptions } = require("./common");

// Database kandidat. A candidate applies to one recruitment request; its company,
// department, division, position and level are copied from that request. Every
// other field is filled by HR; the interview schedules live here so HR can
// reschedule them. The user interview schedule is also set by the HR interview
// when its decision is "passed". Since 2026-11-18 a candidate has no approval: it
// exists once HR saves it, and the user who saved it is the HR PIC.
const LICENSE_TYPES = [
  "pharmacist", // Pharmacist (STRA/SIPA)
  "healthcare professional", // Other healthcare professional (doctor, nurse, etc.)
  "occupational safety expert", // Occupational Safety (K3) Expert
  "construction engineering expert", // Construction/Engineering Expert (SKK, STRI)
  "accountant auditor tax consultant", // Accountant / Auditor / Tax Consultant
  "lead auditor", // Lead auditor certification (ISO, etc.)
  "other", // Other (free text in license_type_other)
];
// Hiring status of a candidate (client list, 2026-11-24; docs/recruitment-interview-requirement.md).
// 1–10 also follow the HR and user interviews; 11–15 are set by hand until the
// offering letter and contract documents arrive. HR may set any of them by hand.
const CANDIDATE_HIRING_STATUSES = [
  "contacting", // 1. Menghubungi (new candidate)
  "no response", // 2. No Respond
  "hr interview", // 3. Interview HR
  "hr interview no show", // 4. No Show (HR Interviews)
  "hr interview rejected", // 5. Ditolak (HR Interviews)
  "user interview", // 6. Interview user (recommended at the HR interview)
  "user interview no show", // 7. No Show (User Interviews)
  "user interview rejected", // 8. Ditolak (User Interviews)
  "user interview consideration", // 9. Pertimbangan (User Interviews)
  "offering letter", // 10. Offering Letter (accepted at the user interview)
  "rejected by candidate", // 11. Ditolak oleh kandidat
  "negotiation", // 12. Negosiasi
  "work contract", // 13. Work Contract
  "onboarding", // 14. Onboarding
  "contract no show", // 15. No Show (contract not uploaded within 2 days)
];
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
      has_professional_license: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        comment: "Professional certification/license to be used by the company; required on create, null for old candidates",
      },
      license_type: {
        type: DataTypes.ENUM(...LICENSE_TYPES),
        allowNull: true,
        comment: "Certification/license type, when has_professional_license",
      },
      license_type_other: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Free-text license type when license_type is other",
      },
      hiring_status: {
        type: DataTypes.ENUM(...CANDIDATE_HIRING_STATUSES),
        allowNull: false,
        defaultValue: "contacting",
        comment: "Hiring status of the candidate (not the request's open/close); set by the interviews or by hand",
      },
      hiring_status_updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "When hiring_status last changed",
      },
      birth_date: { type: DataTypes.DATEONLY, allowNull: true, comment: "Optional, may be filled after the HR interview" },
      birth_place: { type: DataTypes.STRING(255), allowNull: true, comment: "Optional, may be filled after the HR interview" },
      address: { type: DataTypes.TEXT, allowNull: true, comment: "Optional, may be filled after the HR interview" },
      id_user_request: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        comment: "HR who saved the candidate (HR PIC)",
      },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    tableOptions(
      "recruitment_candidates",
      [{ fields: ["name"] }, { fields: ["id_recruitment_request"] }],
      { withStatus: false },
    ),
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

module.exports.LICENSE_TYPES = LICENSE_TYPES;
module.exports.CANDIDATE_HIRING_STATUSES = CANDIDATE_HIRING_STATUSES;
