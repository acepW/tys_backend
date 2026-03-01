const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ContractPayment = sequelize.define(
    "ContractPayment",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Contract Payment",
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
      payment_time_indo: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Payment time in Indonesian",
      },
      payment_time_mandarin: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Payment time in Mandarin",
      },
      total_payment_idr: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: "Total payment in IDR",
      },
      total_payment_rmb: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: "Total payment in RMB",
      },
      currency_type: {
        type: DataTypes.ENUM("idr", "rmb"),
        allowNull: false,
        comment: "Currency type",
      },
      payment_to: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Payment to (example:payment_to : 1)",
      },
      is_open: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Status of Contract Payment (active/inactive)",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Contract Payment (active/inactive)",
      },
    },
    {
      tableName: "contract_payment",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_contract",
          fields: ["id_contract"],
        },
      ],
    },
  );

  // Define associations
  ContractPayment.associate = (models) => {
    // ContractPayment belongs to Contract
    ContractPayment.belongsTo(models.Contract, {
      foreignKey: "id_contract",
      as: "contract",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // ContractPayment has many Contract Payment List
    ContractPayment.hasMany(models.ContractPaymentList, {
      foreignKey: "id_contract_payment",
      as: "contract_payment_list",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // ContractPayment has many Contract Payment Service
    ContractPayment.hasMany(models.ContractPaymentService, {
      foreignKey: "id_contract_payment",
      as: "contract_payment_services",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ContractPayment;
};
