const { DataTypes } = require("sequelize");
const { approvalColumns, candidateColumns, associate, tableOptions } = require("./common");

module.exports = (sequelize) => {
  const RecruitmentUserInterview = sequelize.define(
    "RecruitmentUserInterview",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      ...candidateColumns(),
      assessment: { type: DataTypes.TEXT, allowNull: true, comment: "Penilaian user" },
      decision: {
        type: DataTypes.ENUM("accepted", "not accepted"),
        allowNull: false,
        comment: "Diterima / Ditolak",
      },
      recommended_salary: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      recommended_benefit: { type: DataTypes.TEXT, allowNull: true },
      active_work_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: "Tanggal aktif kerja, filled when accepted",
      },
      ...approvalColumns(),
    },
    tableOptions("recruitment_user_interviews", [{ fields: ["id_recruitment_candidate"] }]),
  );
  RecruitmentUserInterview.associate = (models) =>
    associate(RecruitmentUserInterview, models, { withCandidate: true });
  return RecruitmentUserInterview;
};
