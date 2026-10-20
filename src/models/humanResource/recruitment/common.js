const { DataTypes } = require("sequelize");

// Shared columns and associations of the recruitment modules. Every module is a
// document created as "pending" and then approved or rejected.
const APPROVAL_STATUSES = ["pending", "approve", "reject"];

const approvalColumns = () => ({
  id_user_request: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: "users", key: "id" },
    comment: "User who created the document",
  },
  status: {
    type: DataTypes.ENUM(...APPROVAL_STATUSES),
    allowNull: false,
    defaultValue: "pending",
  },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
});

// Steps after the candidate database point at one candidate. candidate_name is a
// copy kept for lists and approval tasks.
const candidateColumns = () => ({
  id_recruitment_candidate: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: "recruitment_candidates", key: "id" },
  },
  candidate_name: { type: DataTypes.STRING(255), allowNull: false },
});

function associate(Model, models, { fileableType, fileCategories = [], withCandidate = false }) {
  Model.belongsTo(models.User, { foreignKey: "id_user_request", as: "user_request" });
  if (withCandidate)
    Model.belongsTo(models.RecruitmentCandidate, {
      foreignKey: "id_recruitment_candidate",
      as: "candidate",
    });
  for (const category of fileCategories)
    Model.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: fileableType, category },
      as: category,
    });
}

const tableOptions = (tableName, indexes = []) => ({
  tableName,
  timestamps: true,
  underscored: true,
  indexes: [{ fields: ["status"] }, ...indexes],
});

module.exports = { APPROVAL_STATUSES, approvalColumns, candidateColumns, associate, tableOptions };
