const { DataTypes } = require("sequelize");

// History of every recruitment document; module names which table id_document is in.
module.exports = (sequelize) => {
  const Progress = sequelize.define(
    "RecruitmentVerificationProgress",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      module: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: "request, candidate, hr interview, user interview, offering or contract",
      },
      id_document: { type: DataTypes.INTEGER, allowNull: false },
      id_user: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      status: { type: DataTypes.STRING(50), allowNull: false },
      note: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "recruitment_verification_progress",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["module", "id_document"] }],
    },
  );
  Progress.associate = (models) => {
    Progress.belongsTo(models.User, { foreignKey: "id_user", as: "user" });
  };
  return Progress;
};
