const { DataTypes } = require("sequelize");

// Job level master (e.g. Staff, Supervisor, Manager), used by recruitment requests.
module.exports = (sequelize) => {
  const Level = sequelize.define(
    "Level",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Level",
      },
      level_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Level name",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Level (active/inactive)",
      },
    },
    {
      tableName: "levels",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "idx_level_name", fields: ["level_name"] },
        { name: "idx_is_active", fields: ["is_active"] },
      ],
    },
  );

  Level.associate = (models) => {
    Level.hasMany(models.RecruitmentRequest, {
      foreignKey: "id_level",
      as: "recruitment_requests",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Level;
};
