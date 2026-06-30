const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ContractClauseHeader = sequelize.define(
    "ContractClauseHeader",
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
      is_view_product: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Status view product (active/inactive)",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of ContractClauseHeader (active/inactive)",
      },
    },
    {
      tableName: "contract_clause_header",
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
  ContractClauseHeader.associate = (models) => {
    // Contoh: ContractClauseHeader dapat memiliki relasi dengan Order, dll
    // ContractClauseHeader.hasMany(models.Order, { ... });

    //Clause Point belongs to Clause
    ContractClauseHeader.belongsTo(models.Contract, {
      foreignKey: "id_contract",
      as: "contract",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ContractClauseHeader;
};
