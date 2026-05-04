const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ApprovalFlow = sequelize.define(
    "approvalFlow",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Approval Flow",
      },
      approval_for: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Approval for status",
      },
      status: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Approval Flow status",
      },
      label: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Approval Flow label",
      },
      rule_type: {
        type: DataTypes.ENUM("all", "any"),
        allowNull: false,
        comment: "Approval Flow rule type",
      },
      index: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "index of approval flow",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of ApprovalFlow (active/inactive)",
      },
    },
    {
      tableName: "approval_flows",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_status",
          fields: ["status"],
        },
        {
          name: "idx_approval_for",
          fields: ["approval_for"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  ApprovalFlow.associate = (models) => {
    // Contoh: ApprovalFlow dapat memiliki relasi dengan Order, dll
    // ApprovalFlow.hasMany(models.Order, { ... });
    ApprovalFlow.hasMany(models.ApprovalFlowPosition, {
      foreignKey: "id_approval_flow",
      as: "approval_flow_positions",
    });
  };

  return ApprovalFlow;
};
