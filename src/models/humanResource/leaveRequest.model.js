const { DataTypes } = require("sequelize");

// Approval chain, in order. Each stage approves to the next; the director approves to "approved".
const STAGES = ["supervisor", "hr", "spv hr", "manager hr", "director"];
const STATUSES = [
  ...STAGES.map((stage) => `request ${stage}`),
  "approved",
  ...STAGES.map((stage) => `rejected ${stage}`),
];

module.exports = (sequelize) => {
  const LeaveRequest = sequelize.define(
    "LeaveRequest",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_employee: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "employees", key: "id" },
        comment: "Employee taking the leave",
      },
      id_department: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "departments", key: "id" },
        comment: "Employee department at request time",
      },
      id_user_request: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        comment: "User who submitted the request",
      },
      type: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Leave type, e.g. sick, personal",
      },
      start_date: { type: DataTypes.DATEONLY, allowNull: false },
      end_date: { type: DataTypes.DATEONLY, allowNull: false },
      duration: {
        type: DataTypes.DECIMAL(5, 1),
        allowNull: false,
        comment: "Duration in days; defaults to the inclusive day count",
      },
      reason: { type: DataTypes.TEXT, allowNull: false },
      health_facility_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Health facility name (nama fasilitas kesehatan)",
      },
      clinic_phone: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "Clinic phone number",
      },
      clinic_address: { type: DataTypes.TEXT, allowNull: true },
      doctor_name: { type: DataTypes.STRING(255), allowNull: true },
      status: {
        type: DataTypes.ENUM(...STATUSES),
        allowNull: false,
        defaultValue: "request supervisor",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "leave_requests",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "idx_leave_request_employee", fields: ["id_employee"] },
        { name: "idx_leave_request_status", fields: ["status"] },
      ],
    },
  );

  LeaveRequest.associate = (models) => {
    LeaveRequest.belongsTo(models.Employee, {
      foreignKey: "id_employee",
      as: "employee",
    });
    LeaveRequest.belongsTo(models.Department, {
      foreignKey: "id_department",
      as: "department",
    });
    LeaveRequest.belongsTo(models.User, {
      foreignKey: "id_user_request",
      as: "user_request",
    });
    LeaveRequest.hasMany(models.LeaveRequestVerificationProgress, {
      foreignKey: "id_leave_request",
      as: "verification_progress",
    });
    LeaveRequest.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: "leave_requests", category: "files_attachment" },
      as: "files_attachment",
    });
  };

  return LeaveRequest;
};

module.exports.STAGES = STAGES;
module.exports.STATUSES = STATUSES;
