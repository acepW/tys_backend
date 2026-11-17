const { DataTypes } = require("sequelize");
const { approvalColumns, associate, tableOptions } = require("./common");

// Approval chain of a candidate request: created straight to HR Staff, then
// SPV HR -> Manager HR -> Director -> approve. A request from the HR division
// starts at SPV HR. A rejection sends it back to an earlier stage or to the
// requester (returned to requester), who fixes it and submits it again. "reject"
// (rejected for good) is only on requests from before 2026-11-18.
const RETURNED_TO_REQUESTER = "returned to requester";
const REQUEST_STATUSES = [
  "request hr staff",
  "request spv hr",
  "request manager hr",
  "request director",
  RETURNED_TO_REQUESTER,
  "approve",
  "reject",
];
const REQUEST_TYPES = ["replacement", "additional member"];
const HIRING_STATUSES = ["open", "close"];

// Pengajuan kandidat (candidate request): a request to recruit people for a position.
// The master links are nullable only for rows created before they existed; the
// service requires them on create.
module.exports = (sequelize) => {
  const RecruitmentRequest = sequelize.define(
    "RecruitmentRequest",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      request_no: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "REC-<company initial>-MM-YYYY-0001, set on create; null only for old requests without a company",
      },
      id_company: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "companies", key: "id" },
      },
      id_department: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "departments", key: "id" },
      },
      id_division: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "divisions", key: "id" },
      },
      id_position: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "positions", key: "id" },
        comment: "Posisi",
      },
      id_level: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "levels", key: "id" },
      },
      job_title: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Old free-text jabatan, replaced by id_level; kept for old rows",
      },
      number_of_people: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Number of people to hire",
      },
      current_division_member: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Current number of people in the division; required on create since 2026-11-18",
      },
      job_requirement: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Old single job requirement, split into hard_skill/soft_skill/other_requirement; kept for old rows",
      },
      hard_skill: { type: DataTypes.TEXT, allowNull: true, comment: "Job requirement: hard skill" },
      soft_skill: { type: DataTypes.TEXT, allowNull: true, comment: "Job requirement: soft skill" },
      other_requirement: { type: DataTypes.TEXT, allowNull: true, comment: "Job requirement: others" },
      job_description: { type: DataTypes.TEXT, allowNull: true },
      salary_min: {
        type: DataTypes.DECIMAL(15, 0),
        allowNull: true,
        comment: "Salary range from; set by the requester or SPV HR",
      },
      salary_max: {
        type: DataTypes.DECIMAL(15, 0),
        allowNull: true,
        comment: "Salary range to; set by the requester or SPV HR",
      },
      request_type: {
        type: DataTypes.ENUM(...REQUEST_TYPES),
        allowNull: true,
        comment: "replacement = replaces an employee, additional member = new headcount",
      },
      reason: { type: DataTypes.TEXT, allowNull: true },
      hiring_deadline: { type: DataTypes.DATEONLY, allowNull: true },
      hiring_status: {
        type: DataTypes.ENUM(...HIRING_STATUSES),
        allowNull: false,
        defaultValue: "open",
      },
      ...approvalColumns(REQUEST_STATUSES),
    },
    tableOptions("recruitment_requests", [{ name: "idx_recruitment_request_no", fields: ["request_no"] }]),
  );
  RecruitmentRequest.associate = (models) => {
    associate(RecruitmentRequest, models, {});
    RecruitmentRequest.belongsTo(models.Company, { foreignKey: "id_company", as: "company" });
    RecruitmentRequest.belongsTo(models.Department, { foreignKey: "id_department", as: "department" });
    RecruitmentRequest.belongsTo(models.Division, { foreignKey: "id_division", as: "division" });
    RecruitmentRequest.belongsTo(models.Position, { foreignKey: "id_position", as: "position" });
    RecruitmentRequest.belongsTo(models.Level, { foreignKey: "id_level", as: "level" });
    RecruitmentRequest.hasMany(models.RecruitmentCandidate, {
      foreignKey: "id_recruitment_request",
      as: "candidates",
    });
    RecruitmentRequest.hasMany(models.RecruitmentRequestRevision, {
      foreignKey: "id_recruitment_request",
      as: "revisions",
    });
  };
  return RecruitmentRequest;
};

module.exports.REQUEST_STATUSES = REQUEST_STATUSES;
module.exports.RETURNED_TO_REQUESTER = RETURNED_TO_REQUESTER;
module.exports.REQUEST_TYPES = REQUEST_TYPES;
module.exports.HIRING_STATUSES = HIRING_STATUSES;
