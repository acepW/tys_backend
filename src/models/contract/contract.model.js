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
        defaultValue: DataTypes.NOW,
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
          "reject by customer"
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
      id_previous_contract: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "contracts",
          key: "id",
        },
        comment:
          "FK ke contract langsung sebelumnya (jika ini adalah adendum/pengganti)",
      },
      id_root_contract: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "contracts",
          key: "id",
        },
        comment:
          "FK ke contract pertama/original dalam rangkaian (null jika ini sendiri original)",
      },
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: "Nomor urut versi dalam rangkaian penggantian",
      },
      is_adendum: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment:
          "True jika contract ini dibuat sebagai pengganti/adendum dari contract lain",
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
          fields: [{ name: "contract_title_indo", length: 100 }],
        },
        { name: "idx_root_contract", fields: ["id_root_contract"] },
        { name: "idx_previous_contract", fields: ["id_previous_contract"] },
        // Composite Index
        { name: "idx_company_active", fields: ["id_company", "is_active"] },
        { name: "idx_status_active", fields: ["status", "is_active"] },
      ],
    }
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

    // Contract has many Invoice
    Contract.hasMany(models.Invoice, {
      foreignKey: "id_contract",
      as: "invoices",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Contract has many Debit Note
    Contract.hasMany(models.DebitNote, {
      foreignKey: "id_contract",
      as: "debit_notes",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Contract has many Payment Request
    Contract.hasMany(models.PaymentRequest, {
      foreignKey: "id_contract",
      as: "payment_requests",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Contract has many PreOrder
    Contract.hasMany(models.PreOrder, {
      foreignKey: "id_contract",
      as: "pre_orders",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // 🔥 Self-referencing: Contract ini menggantikan contract sebelumnya
    Contract.belongsTo(models.Contract, {
      foreignKey: "id_previous_contract",
      as: "previous_contract",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    // 🔥 Self-referencing: Contract ini sudah diganti oleh contract berikutnya
    Contract.hasOne(models.Contract, {
      foreignKey: "id_previous_contract",
      as: "next_contract",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    // 🔥 Self-referencing: Contract original/root dalam rangkaian ini
    Contract.belongsTo(models.Contract, {
      foreignKey: "id_root_contract",
      as: "root_contract",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    // 🔥 Self-referencing: Semua versi turunan dari root ini (kebalikan dari root_contract)
    Contract.hasMany(models.Contract, {
      foreignKey: "id_root_contract",
      as: "derived_versions",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
  };

  return Contract;
};
