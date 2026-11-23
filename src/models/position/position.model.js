const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Position = sequelize.define(
    "Position",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Position",
      },
      position_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Position name",
      },
      // Both null: a position across the organisation (e.g. Direktur).
      // Only id_department: a department-level position (e.g. HRGA Supervisor).
      // id_division: a division position; id_department is copied from the division.
      id_department: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "departments", key: "id" },
        comment: "Department of the position; null for positions across departments",
      },
      id_division: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "divisions", key: "id" },
        comment: "Division of the position; null for department-level or global positions",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Position (active/inactive)",
      },
    },
    {
      tableName: "positions",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_position_name",
          fields: ["position_name"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
        {
          name: "idx_position_department",
          fields: ["id_department"],
        },
        {
          name: "idx_position_division",
          fields: ["id_division"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  Position.associate = (models) => {
    // Contoh: Position dapat memiliki relasi dengan Order, dll
    // Position.hasMany(models.Order, { ... });

    Position.belongsTo(models.Department, {
      foreignKey: "id_department",
      as: "department",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    Position.belongsTo(models.Division, {
      foreignKey: "id_division",
      as: "division",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Position has many Users
    Position.hasMany(models.User, {
      foreignKey: "id_position",
      as: "users",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Position has many PositionMenus
    Position.hasMany(models.PositionMenu, {
      foreignKey: "id_position",
      as: "position_menus",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    Position.hasMany(models.ApprovalFlowPosition, {
      foreignKey: "id_position",
      as: "approval_flow_positions",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return Position;
};
