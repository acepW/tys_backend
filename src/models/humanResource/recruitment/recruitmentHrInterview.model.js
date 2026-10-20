const { DataTypes } = require("sequelize");
const { approvalColumns, candidateColumns, associate, tableOptions } = require("./common");

module.exports = (sequelize) => {
  const RecruitmentHrInterview = sequelize.define(
    "RecruitmentHrInterview",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      ...candidateColumns(),
      psychotest_result: { type: DataTypes.TEXT, allowNull: true, comment: "Hasil psikotes" },
      interview_result: { type: DataTypes.TEXT, allowNull: true, comment: "Hasil wawancara HR" },
      decision: {
        type: DataTypes.ENUM("passed", "not passed"),
        allowNull: false,
        comment: "Lolos / Tidak Lolos",
      },
      work_system: { type: DataTypes.STRING(255), allowNull: true, comment: "Sistem kerja" },
      salary: { type: DataTypes.STRING(255), allowNull: true },
      ...approvalColumns(),
    },
    tableOptions("recruitment_hr_interviews", [{ fields: ["id_recruitment_candidate"] }]),
  );
  RecruitmentHrInterview.associate = (models) =>
    associate(RecruitmentHrInterview, models, {
      fileableType: "recruitment_hr_interviews",
      fileCategories: ["files_attachment"],
      withCandidate: true,
    });
  return RecruitmentHrInterview;
};
