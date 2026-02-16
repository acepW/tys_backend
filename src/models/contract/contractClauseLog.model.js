const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ContractClauseLog = sequelize.define(
    "ContractClauseLog",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Contract Clause",
      },
      id_contract_clause: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "contract_clause",
          key: "id",
        },
        comment: "Id contract clause from contract_clause ",
      },
      id_contract_clause_point: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "contract_clause_point",
          key: "id",
        },
        comment: "Id contract clause point from contract_clause_point ",
      },
      description_indo_before: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
        comment: "Description is BAB for Indonesian before",
      },
      description_mandarin_before: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
        comment: "Description is BAB for Mandarin before",
      },
      description_indo_after: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
        comment: "Description is BAB for Indonesian after",
      },
      description_mandarin_after: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
        comment: "Description is BAB for Mandarin after",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of ContractClauseLog (active/inactive)",
      },
    },
    {
      tableName: "contract_clause_log",
      timestamps: true,
      underscored: true,
    }
  );

  // Define associations (untuk future development)
  ContractClauseLog.associate = (models) => {
    // Contoh: ContractClauseLog dapat memiliki relasi dengan Order, dll
    // ContractClauseLog.hasMany(models.Order, { ... });

    //ContractClauseLog belongs to Contract Clause Point
    ContractClauseLog.belongsTo(models.ContractClause, {
      foreignKey: "id_contract_clause",
      as: "contract_clause",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //ContractClauseLog belongs to Contract Clause Point
    ContractClauseLog.belongsTo(models.ContractClausePoint, {
      foreignKey: "id_contract_clause_point",
      as: "contract_clause_point",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ContractClauseLog;
};
