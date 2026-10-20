const { DataTypes } = require("sequelize");
const { approvalColumns, candidateColumns, associate, tableOptions } = require("./common");

// Offering letter. job_title and id_department default to the candidate's.
module.exports = (sequelize) => {
  const RecruitmentOffering = sequelize.define(
    "RecruitmentOffering",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      ...candidateColumns(),
      offering_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: "Tanggal offering letter",
      },
      birth_place: { type: DataTypes.STRING(255), allowNull: true },
      birth_date: { type: DataTypes.DATEONLY, allowNull: true },
      address: { type: DataTypes.TEXT, allowNull: true },
      job_title: { type: DataTypes.STRING(255), allowNull: true },
      id_department: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "departments", key: "id" },
      },
      effective_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: "Tanggal efektif bekerja",
      },
      salary: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      benefit: { type: DataTypes.TEXT, allowNull: true },
      ...approvalColumns(),
    },
    tableOptions("recruitment_offerings", [{ fields: ["id_recruitment_candidate"] }]),
  );
  RecruitmentOffering.associate = (models) => {
    associate(RecruitmentOffering, models, {
      fileableType: "recruitment_offerings",
      fileCategories: ["files_offering_letter", "files_ktp", "files_npwp"],
      withCandidate: true,
    });
    RecruitmentOffering.belongsTo(models.Department, {
      foreignKey: "id_department",
      as: "department",
    });
  };
  return RecruitmentOffering;
};
