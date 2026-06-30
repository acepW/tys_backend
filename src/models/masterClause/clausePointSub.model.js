const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ClausePointSub = sequelize.define(
    "ClausePointSub",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Clause Point",
      },
      id_clause_point: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "clause_point",
          key: "id",
        },
        comment: "Id clause from clause point",
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
      index: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Index for clause point",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of ClausePointSub (active/inactive)",
      },
    },
    {
      tableName: "clause_point_sub",
      timestamps: true,
      underscored: true,
    }
  );

  // Define associations (untuk future development)
  ClausePointSub.associate = (models) => {
    // Contoh: ClausePointSub dapat memiliki relasi dengan Order, dll
    // ClausePointSub.hasMany(models.Order, { ... });

    //Clause Point belongs to Clause
    ClausePointSub.belongsTo(models.ClausePoint, {
      foreignKey: "id_clause_point",
      as: "clause_point",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ClausePointSub;
};
