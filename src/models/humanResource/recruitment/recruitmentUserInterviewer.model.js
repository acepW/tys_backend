const { DataTypes } = require("sequelize");

// One interviewer of a user interview (User #1, #2, ...), with their own schedule.
// HR fills the attendance; the interviewer fills the report (scores with
// interview_type "user") and the decision.
module.exports = (sequelize) => {
  const RecruitmentUserInterviewer = sequelize.define(
    "RecruitmentUserInterviewer",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_recruitment_user_interview: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "recruitment_user_interviews", key: "id" },
      },
      id_user: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        comment: "Interviewer (direct leader: SPV, Manager, Director)",
      },
      position_name: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Interviewer's position when scheduled",
      },
      interview_date: { type: DataTypes.DATEONLY, allowNull: true },
      interview_time: { type: DataTypes.TIME, allowNull: true },
      method: { type: DataTypes.ENUM("online", "offline"), allowNull: true },
      meeting_room: { type: DataTypes.STRING(255), allowNull: true },
      meeting_link: { type: DataTypes.STRING(1000), allowNull: true },
      attendance: { type: DataTypes.ENUM("attended", "no show"), allowNull: true, comment: "Filled by HR" },
      id_user_attendance: { type: DataTypes.INTEGER, allowNull: true, references: { model: "users", key: "id" } },
      attendance_at: { type: DataTypes.DATE, allowNull: true },
      decision: {
        type: DataTypes.ENUM("accepted", "considered", "not accepted"),
        allowNull: true,
        comment: "Diterima / Dipertimbangkan / Tidak Diterima, by the interviewer",
      },
      description: { type: DataTypes.TEXT, allowNull: true, comment: "Deskripsi of the report" },
      decided_at: { type: DataTypes.DATE, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: "recruitment_user_interviewers",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["id_recruitment_user_interview"] }, { fields: ["id_user"] }],
    },
  );
  RecruitmentUserInterviewer.associate = (models) => {
    RecruitmentUserInterviewer.belongsTo(models.RecruitmentUserInterview, {
      foreignKey: "id_recruitment_user_interview",
      as: "user_interview",
    });
    RecruitmentUserInterviewer.belongsTo(models.User, { foreignKey: "id_user", as: "user" });
    RecruitmentUserInterviewer.belongsTo(models.User, { foreignKey: "id_user_attendance", as: "user_attendance" });
    RecruitmentUserInterviewer.hasMany(models.RecruitmentInterviewScore, {
      foreignKey: "id_interview",
      constraints: false,
      scope: { interview_type: "user" },
      as: "scores",
    });
  };
  return RecruitmentUserInterviewer;
};
