const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ContractPaymentList = sequelize.define(
    "ContractPaymentList",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Contract Payment",
      },
      id_contract_payment: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "contract_payment",
          key: "id",
        },
        comment: "Foreign key to contract payment table",
      },
      service_name_indo: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Service name in Indonesian",
      },
      service_name_mandarin: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Service name in Mandarin",
      },
      price_idr: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: "Price in IDR",
      },
      price_rmb: {
        type: DataTypes.FLOAT,
        allowNull: false,
        comment: "Price in RMB",
      },
      payment_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: "Payment type",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Contract Payment (active/inactive)",
      },
    },
    {
      tableName: "contract_payment_list",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_contract_payment",
          fields: ["id_contract_payment"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    },
  );

  // Define associations
  ContractPaymentList.associate = (models) => {
    // ContractPaymentList belongs to Contract
    ContractPaymentList.belongsTo(models.ContractPayment, {
      foreignKey: "id_contract_payment",
      as: "contract_payment",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // ContractPaymentList has many Contract Payment Service
    ContractPaymentList.hasMany(models.ContractPaymentService, {
      foreignKey: "id_contract_payment_list",
      as: "contract_payment_services",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ContractPaymentList;
};
