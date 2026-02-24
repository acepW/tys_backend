const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Contract = sequelize.define(
    "Contract",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Contract",
      },
      id_quotation: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "quotations",
          key: "id",
        },
        comment: "Foreign key to quotations table",
      },
      id_company: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "companies",
          key: "id",
        },
        comment: "Foreign key to companies table",
      },
      id_customer: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "customers",
          key: "id",
        },
        comment: "Foreign key to companies table",
      },
      date: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: "Date of Contract",
      },
      contract_no: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "No of Contract",
      },
      contract_title_indo: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Contract title for Indonesian",
      },
      contract_title_mandarin: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Contract title for Mandarin",
      },
      contract_type: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Contract type",
      },
      note: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Note for verification",
      },
      status: {
        type: DataTypes.ENUM(
          "pending",
          "on verification",
          "rejected",
          "approved",
          "sending to customer",
          "approve by customer",
          "reject by customer",
        ),
        allowNull: false,
        defaultValue: "pending",
        comment: "Status of Contract",
      },
      contract_to: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Contract to (example:contract_to : 1)",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Contract (active/inactive)",
      },
    },
    {
      tableName: "contracts",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_quotation",
          fields: ["id_quotation"],
        },
        {
          name: "idx_id_company",
          fields: ["id_company"],
        },
        {
          name: "idx_id_customer",
          fields: ["id_customer"],
        },
        {
          name: "idx_date",
          fields: ["date"],
        },
        {
          name: "idx_contract_no",
          fields: ["contract_no"],
        },
        {
          name: "idx_contract_title_indo",
          fields: ["contract_title_indo"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    },
  );

  // Define associations
  Contract.associate = (models) => {
    // Contract belongs to Quotation
    Contract.belongsTo(models.Quotation, {
      foreignKey: "id_quotation",
      as: "quotation",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Contract belongs to Company
    Contract.belongsTo(models.Company, {
      foreignKey: "id_company",
      as: "company",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Contract belongs to Customer
    Contract.belongsTo(models.Customer, {
      foreignKey: "id_customer",
      as: "customer",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Contract has many Contract Service
    Contract.hasMany(models.ContractService, {
      foreignKey: "id_contract",
      as: "services",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Contract has many Contract Clause
    Contract.hasMany(models.ContractClause, {
      foreignKey: "id_contract",
      as: "clauses",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Contract has many Contract Verification Progress
    Contract.hasMany(models.ContractVerificationProgress, {
      foreignKey: "id_contract",
      as: "verification_progress",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Contract has many Contract Payment
    Contract.hasMany(models.ContractPayment, {
      foreignKey: "id_contract",
      as: "contract_payment",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Contract;
};
