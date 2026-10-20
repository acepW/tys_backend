const { DataTypes } = require("sequelize");
const { approvalColumns, candidateColumns, associate, tableOptions } = require("./common");

// Kontrak kerja. Personal and job fields default to the candidate and its approved
// offering letter. It does not create an employee record.
module.exports = (sequelize) => {
  const RecruitmentContract = sequelize.define(
    "RecruitmentContract",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      ...candidateColumns(),
      contract_date: { type: DataTypes.DATEONLY, allowNull: false, comment: "Tanggal kontrak" },
      gender: { type: DataTypes.STRING(50), allowNull: true },
      birth_place: { type: DataTypes.STRING(255), allowNull: true },
      birth_date: { type: DataTypes.DATEONLY, allowNull: true },
      address: { type: DataTypes.TEXT, allowNull: true },
      nik: { type: DataTypes.STRING(50), allowNull: true },
      job_title: { type: DataTypes.STRING(255), allowNull: true },
      id_department: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "departments", key: "id" },
      },
      id_employee_supervisor: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "employees", key: "id" },
        comment: "Bertanggung jawab kepada",
      },
      salary: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      contract_type: { type: DataTypes.STRING(100), allowNull: true, comment: "Jenis kontrak" },
      contract_duration: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Durasi kontrak, e.g. 12 bulan",
      },
      end_date: { type: DataTypes.DATEONLY, allowNull: true, comment: "Tanggal berakhir" },
      ...approvalColumns(),
    },
    tableOptions("recruitment_contracts", [{ fields: ["id_recruitment_candidate"] }]),
  );
  RecruitmentContract.associate = (models) => {
    associate(RecruitmentContract, models, { withCandidate: true });
    RecruitmentContract.belongsTo(models.Department, {
      foreignKey: "id_department",
      as: "department",
    });
    RecruitmentContract.belongsTo(models.Employee, {
      foreignKey: "id_employee_supervisor",
      as: "supervisor",
    });
  };
  return RecruitmentContract;
};
