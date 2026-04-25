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
      ],
    },
  );

  // Define associations (untuk future development)
  Position.associate = (models) => {
    // Contoh: Position dapat memiliki relasi dengan Order, dll
    // Position.hasMany(models.Order, { ... });

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
  };

  return Position;
};
