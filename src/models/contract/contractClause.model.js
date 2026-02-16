const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ContractClause = sequelize.define(
    "ContractClause",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Contract Clause",
      },
      id_contract: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "contracts",
          key: "id",
        },
        comment: "Foreign key to contracts table",
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
        comment: "Status of ContractClause (active/inactive)",
      },
    },
    {
      tableName: "contract_clause",
      timestamps: true,
      underscored: true,
    }
  );

  // Define associations (untuk future development)
  ContractClause.associate = (models) => {
    // Contoh: ContractClause dapat memiliki relasi dengan Order, dll
    // ContractClause.hasMany(models.Order, { ... });

    //Contract Clause belongs to Contract
    ContractClause.belongsTo(models.Contract, {
      foreignKey: "id_contract",
      as: "contract",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //ContractClause has many ContractClause Point
    ContractClause.hasMany(models.ContractClausePoint, {
      foreignKey: "id_contract_clause",
      as: "clause_point",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Contract Clause has many Contract Clause Log
    ContractClause.hasMany(models.ContractClauseLog, {
      foreignKey: "id_contract_clause",
      as: "clause_logs",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ContractClause;
};
