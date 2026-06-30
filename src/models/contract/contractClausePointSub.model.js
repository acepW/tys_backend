const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ContractClausePointSub = sequelize.define(
    "ContractClausePointSub",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Contract Clause Point",
      },
      id_contract_clause_point: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "contract_clause_point",
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
        comment: "Status of ContractClausePointSub (active/inactive)",
      },
    },
    {
      tableName: "contract_clause_point_sub",
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
  ContractClausePointSub.associate = (models) => {
    // Contoh: ContractClausePointSub dapat memiliki relasi dengan Order, dll
    // ContractClausePointSub.hasMany(models.Order, { ... });

    //Clause Point belongs to Clause
    ContractClausePointSub.belongsTo(models.ContractClausePoint, {
      foreignKey: "id_contract_clause_point",
      as: "contract_clause_point",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ContractClausePointSub;
};
