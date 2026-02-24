const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ContractPaymentService = sequelize.define(
    "ContractPaymentService",
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
      id_contract_payment_list: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "contract_payment_list",
          key: "id",
        },
        comment: "Foreign key to contract payment list table",
      },
      id_quotation_service: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "quotation_service",
          key: "id",
        },
        comment: "Foreign key to quotations service table",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Quotation Payment (active/inactive)",
      },
    },
    {
      tableName: "contract_payment_service",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_contract_payment",
          fields: ["id_contract_payment"],
        },
        {
          name: "idx_id_contract_payment_list",
          fields: ["id_contract_payment_list"],
        },
        {
          name: "idx_id_quotation_service",
          fields: ["id_quotation_service"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    },
  );

  // Define associations
  ContractPaymentService.associate = (models) => {
    // ContractPaymentService belongs to Quotation payment
    ContractPaymentService.belongsTo(models.ContractPayment, {
      foreignKey: "id_contract_payment",
      as: "contract_payment",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // ContractPaymentService belongs to Contract payment list
    ContractPaymentService.belongsTo(models.ContractPaymentList, {
      foreignKey: "id_contract_payment_list",
      as: "contract_payment_list",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // ContractPaymentService belongs to Quotation service
    ContractPaymentService.belongsTo(models.QuotationService, {
      foreignKey: "id_quotation_service",
      as: "quotation_service",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ContractPaymentService;
};
