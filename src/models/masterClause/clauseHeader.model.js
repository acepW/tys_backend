const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ClauseHeader = sequelize.define(
    "ClauseHeader",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for ClauseHeader",
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
        comment: "Index for clauseHeader",
      },
      is_view_product: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Status view product (active/inactive)",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of ClauseHeader (active/inactive)",
      },
    },
    {
      tableName: "clause_header",
      timestamps: true,
      underscored: true,
    }
  );

  // Define associations (untuk future development)
  ClauseHeader.associate = (models) => {
    // Contoh: ClauseHeader dapat memiliki relasi dengan Order, dll
    // ClauseHeader.hasMany(models.Order, { ... });

    //ClauseHeader belongs to Clause template
    ClauseHeader.belongsTo(models.ClauseTemplate, {
      foreignKey: "id_clause_template",
      as: "clause_template",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ClauseHeader;
};
