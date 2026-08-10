const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ContractClauseFooter = sequelize.define(
    "ContractClauseFooter",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Contract Clause Point",
      },
      id_contract: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "contracts",
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
      index: {
        type: DataTypes.INTEGER,
        comment: "Status view product (active/inactive)",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of ContractClauseFooter (active/inactive)",
      },
    },
    {
      tableName: "contract_clause_footer",
      timestamps: true,
      underscored: true,
      index: [
        {
          name: "idx_id_contract_clause_point",
          fields: ["id_contract_clause_point"],
        },
      ],
    }
  );

  // Define associations (untuk future development)
  ContractClauseFooter.associate = (models) => {
    // Contoh: ContractClauseFooter dapat memiliki relasi dengan Order, dll
    // ContractClauseFooter.hasMany(models.Order, { ... });
  };

  return ContractClauseFooter;
};
