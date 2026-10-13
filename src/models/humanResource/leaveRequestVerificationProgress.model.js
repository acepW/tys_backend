const { DataTypes } = require("sequelize");

// Records what each actor did (created, edited, approved <stage>, rejected <stage>),
// not the request's next status.
module.exports = (sequelize) => {
  const Progress = sequelize.define(
    "LeaveRequestVerificationProgress",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_leave_request: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "leave_requests", key: "id" },
      },
      id_user: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      status: { type: DataTypes.STRING(50), allowNull: false },
      note: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "leave_request_verification_progress",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "idx_leave_request_progress_parent", fields: ["id_leave_request"] },
      ],
    },
  );

  Progress.associate = (models) => {
    Progress.belongsTo(models.LeaveRequest, {
      foreignKey: "id_leave_request",
      as: "leave_request",
    });
    Progress.belongsTo(models.User, { foreignKey: "id_user", as: "user" });
  };

  return Progress;
};
