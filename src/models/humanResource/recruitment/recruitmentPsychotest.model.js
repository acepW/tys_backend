const { DataTypes } = require("sequelize");

// Psychotest results of an HR interview (Hasil Psikotes), one row per test tool.
module.exports = (sequelize) => {
  const RecruitmentPsychotest = sequelize.define(
    "RecruitmentPsychotest",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_recruitment_hr_interview: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "recruitment_hr_interviews", key: "id" },
      },
      tool_name: { type: DataTypes.STRING(255), allowNull: false, comment: "Nama alat tes" },
      description: { type: DataTypes.TEXT, allowNull: true, comment: "Deskripsi psikotes" },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: "recruitment_psychotests",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["id_recruitment_hr_interview"] }],
    },
  );
  RecruitmentPsychotest.associate = (models) => {
    // Hasil psikotes (upload)
    RecruitmentPsychotest.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: "recruitment_psychotests", category: "files_result" },
      as: "files_result",
    });
  };
  return RecruitmentPsychotest;
};
