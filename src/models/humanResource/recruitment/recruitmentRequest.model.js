const { DataTypes } = require("sequelize");
const { approvalColumns, associate, tableOptions } = require("./common");

// Pengajuan kandidat: a request to recruit for a position.
module.exports = (sequelize) => {
  const RecruitmentRequest = sequelize.define(
    "RecruitmentRequest",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      job_title: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "Jabatan (free text, e.g. Staff, Supervisor)",
      },
      id_position: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "positions", key: "id" },
        comment: "Posisi",
      },
      job_recruitment: { type: DataTypes.TEXT, allowNull: true },
      job_description: { type: DataTypes.TEXT, allowNull: true },
      ...approvalColumns(),
    },
    tableOptions("recruitment_requests"),
  );
  RecruitmentRequest.associate = (models) => {
    associate(RecruitmentRequest, models, {});
    RecruitmentRequest.belongsTo(models.Position, { foreignKey: "id_position", as: "position" });
  };
  return RecruitmentRequest;
};
