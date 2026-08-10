const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ClauseFooter = sequelize.define(
    "ClauseFooter",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for ClauseFooter",
      },
      id_clause_template: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "clause_template",
          key: "id",
        },
        comment: "Foreign key to clause_template table",
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
        comment: "Index for clauseFooter",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of ClauseFooter (active/inactive)",
      },
    },
    {
      tableName: "clause_footer",
      timestamps: true,
      underscored: true,
    }
  );

  // Define associations (untuk future development)
  ClauseFooter.associate = (models) => {
    // Contoh: ClauseFooter dapat memiliki relasi dengan Order, dll
    // ClauseFooter.hasMany(models.Order, { ... });
  };

  return ClauseFooter;
};
