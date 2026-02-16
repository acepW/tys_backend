const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ClausePoint = sequelize.define(
    "ClausePoint",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Clause Point",
      },
      id_clause: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "clause",
          key: "id",
        },
        comment: "Id clause from clause",
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
        comment: "Status of ClausePoint (active/inactive)",
      },
    },
    {
      tableName: "clause_point",
      timestamps: true,
      underscored: true,
    }
  );

  // Define associations (untuk future development)
  ClausePoint.associate = (models) => {
    // Contoh: ClausePoint dapat memiliki relasi dengan Order, dll
    // ClausePoint.hasMany(models.Order, { ... });

    //Clause Point belongs to Clause
    ClausePoint.belongsTo(models.Clause, {
      foreignKey: "id_clause",
      as: "clause",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ClausePoint;
};
