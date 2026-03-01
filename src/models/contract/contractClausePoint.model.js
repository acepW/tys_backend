const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ContractClausePoint = sequelize.define(
    "ContractClausePoint",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Contract Clause Point",
      },
      id_contract_clause: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "contract_clause",
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
        comment: "Status of ContractClausePoint (active/inactive)",
      },
    },
    {
      tableName: "contract_clause_point",
      timestamps: true,
      underscored: true,
      index: [
        { name: "idx_id_contract_clause", fields: ["id_contract_clause"] },
      ],
    },
  );

  // Define associations (untuk future development)
  ContractClausePoint.associate = (models) => {
    // Contoh: ContractClausePoint dapat memiliki relasi dengan Order, dll
    // ContractClausePoint.hasMany(models.Order, { ... });

    //Clause Point belongs to Clause
    ContractClausePoint.belongsTo(models.ContractClause, {
      foreignKey: "id_contract_clause",
      as: "contract_clause",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Contract Clause point has many Contract Clause Log
    ContractClausePoint.hasMany(models.ContractClauseLog, {
      foreignKey: "id_contract_clause_point",
      as: "clause_logs",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ContractClausePoint;
};
