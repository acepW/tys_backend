const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ApprovalFlowPosition = sequelize.define(
    "approvalFlowPosition",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Approval Flow",
      },
      id_approval_flow: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "approval_flows",
          key: "id",
        },
        comment: "Foreign key for Approval Flow",
      },
      id_position: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "positions",
          key: "id",
        },
        comment: "Foreign key for Position",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of ApprovalFlowPosition (active/inactive)",
      },
    },
    {
      tableName: "approval_flow_positions",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_approval_flow",
          fields: ["id_approval_flow"],
        },
        {
          name: "idx_id_position",
          fields: ["id_position"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  ApprovalFlowPosition.associate = (models) => {
    // Contoh: ApprovalFlowPosition dapat memiliki relasi dengan Order, dll
    // ApprovalFlowPosition.hasMany(models.Order, { ... });

    ApprovalFlowPosition.belongsTo(models.ApprovalFlow, {
      foreignKey: "id_approval_flow",
      as: "approval_flow",
    });
    ApprovalFlowPosition.belongsTo(models.Position, {
      foreignKey: "id_position",
      as: "position",
    });
  };

  return ApprovalFlowPosition;
};
