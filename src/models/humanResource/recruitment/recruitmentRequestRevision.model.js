const { DataTypes } = require("sequelize");

// One changed field of a candidate request edit, e.g. HR Staff revising the form
// while approving. Fields changed in the same edit share revision_no.
module.exports = (sequelize) => {
  const RecruitmentRequestRevision = sequelize.define(
    "RecruitmentRequestRevision",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_recruitment_request: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "recruitment_requests", key: "id" },
      },
      revision_no: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "1 for the first edit of the request, 2 for the next, ...",
      },
      id_user: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      field: { type: DataTypes.STRING(100), allowNull: false },
      old_value: { type: DataTypes.TEXT, allowNull: true },
      new_value: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "recruitment_request_revisions",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["id_recruitment_request", "revision_no"] }],
    },
  );
  RecruitmentRequestRevision.associate = (models) => {
    RecruitmentRequestRevision.belongsTo(models.RecruitmentRequest, {
      foreignKey: "id_recruitment_request",
      as: "recruitment_request",
    });
    RecruitmentRequestRevision.belongsTo(models.User, { foreignKey: "id_user", as: "user" });
  };
  return RecruitmentRequestRevision;
};
