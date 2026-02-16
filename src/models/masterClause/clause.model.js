const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Clause = sequelize.define(
    "Clause",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Clause",
      },
      description_indo: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
        comment: "Description is BAB for Indonesian",
      },
      description_mandarin: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
        comment: "Description is BAB for Mandarin",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Clause (active/inactive)",
      },
    },
    {
      tableName: "clause",
      timestamps: true,
      underscored: true,
    }
  );

  // Define associations (untuk future development)
  Clause.associate = (models) => {
    // Contoh: Clause dapat memiliki relasi dengan Order, dll
    // Clause.hasMany(models.Order, { ... });

    //Clause has many Clause Point
    Clause.hasMany(models.ClausePoint, {
      foreignKey: "id_clause",
      as: "clause_points",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Clause;
};
