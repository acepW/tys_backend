const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ClauseTemplate = sequelize.define(
    "ClauseTemplate",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for ClauseTemplate",
      },
      template_name: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
        comment: "Description is BAB for Indonesian",
      },
      contract_type: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
        comment: "Description is BAB for Mandarin",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of ClauseTemplate (active/inactive)",
      },
    },
    {
      tableName: "clause_template",
      timestamps: true,
      underscored: true,
    }
  );

  // Define associations (untuk future development)
  ClauseTemplate.associate = (models) => {
    // Contoh: ClauseTemplate dapat memiliki relasi dengan Order, dll
    // ClauseTemplate.hasMany(models.Order, { ... });

    //ClauseTemplate has many ClauseTemplate Point
    ClauseTemplate.hasMany(models.Clause, {
      foreignKey: "id_clause_template",
      as: "clauses",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //ClauseTemplate has many Clause header
    ClauseTemplate.hasMany(models.ClauseHeader, {
      foreignKey: "id_clause_template",
      as: "clauses_header",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ClauseTemplate;
};
