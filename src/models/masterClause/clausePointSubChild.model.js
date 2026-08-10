const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ClausePointSubChild = sequelize.define(
    "ClausePointSubChild",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Clause Point",
      },
      id_clause_point_sub: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "clause_point_sub",
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
        comment: "Status of ClausePointSubChild (active/inactive)",
      },
    },
    {
      tableName: "clause_point_sub_child",
      timestamps: true,
      underscored: true,
    }
  );

  // Define associations (untuk future development)
  ClausePointSubChild.associate = (models) => {
    // Contoh: ClausePointSubChild dapat memiliki relasi dengan Order, dll
    // ClausePointSubChild.hasMany(models.Order, { ... });
  };

  return ClausePointSubChild;
};
