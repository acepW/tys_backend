const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Invoice = sequelize.define(
    "Invoice",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Invoice",
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
      id_contract: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "contracts",
          key: "id",
        },
        comment: "Foreign key to contracts table",
      },
      id_contract_payment: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "contract_payment",
          key: "id",
        },
        comment: "Foreign key to contracts_payment table",
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
      id_user_create: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "Foreign key to users table",
      },
      id_user_approve: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "Id user who approve the service pricing",
      },
      id_user_reject: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "Id user who reject the service pricing",
      },
      date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: "Date of Invoice",
      },
      due_date: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Due date of Invoice",
      },
      invoice_no: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "No of Invoice",
      },
      tax_ppn: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Tax ppn applicable flag",
      },
      tax_pph_23: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Tax pph 23 applicable flag",
      },
      sub_total: {
        type: DataTypes.DECIMAL(15, 0),
        defaultValue: 0,
        comment: "Sub total amount",
      },
      ppn: {
        type: DataTypes.DECIMAL(15, 0),
        defaultValue: 0,
        comment: "PPN amount",
      },
      pph: {
        type: DataTypes.DECIMAL(15, 0),
        defaultValue: 0,
        comment: "PPH amount",
      },
      total: {
        type: DataTypes.DECIMAL(15, 0),
        defaultValue: 0,
        comment: "Total amount",
      },
      note: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "Note for verification",
      },
      file_invoice: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "File for upload invoice",
      },
      note_reject: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "Note for rejection",
      },
      status: {
        type: DataTypes.ENUM(
          "pending",
          "on verification",
          "rejected",
          "approved",
          "signing",
          "waiting for payment",
          "paid",
        ),
        allowNull: false,
        defaultValue: "pending",
        comment: "Status of Invoice",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Invoice (active/inactive)",
      },
    },
    {
      tableName: "invoices",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_quotation",
          fields: ["id_quotation"],
        },
        {
          name: "idx_id_contract",
          fields: ["id_contract"],
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
          name: "idx_invoice_no",
          fields: ["invoice_no"],
        },
        // Composite Index
        { name: "idx_company_active", fields: ["id_company", "is_active"] },
        { name: "idx_status_active", fields: ["status", "is_active"] },
      ],
    },
  );

  // Define associations
  Invoice.associate = (models) => {
    // Invoice belongs to Quotation
    Invoice.belongsTo(models.Quotation, {
      foreignKey: "id_quotation",
      as: "quotation",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Invoice belongs to Contract
    Invoice.belongsTo(models.Contract, {
      foreignKey: "id_contract",
      as: "contract",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Invoice belongs to Contract Payment
    Invoice.belongsTo(models.ContractPayment, {
      foreignKey: "id_contract_payment",
      as: "contract_payment",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Invoice belongs to Company
    Invoice.belongsTo(models.Company, {
      foreignKey: "id_company",
      as: "company",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Invoice belongs to Customer
    Invoice.belongsTo(models.Customer, {
      foreignKey: "id_customer",
      as: "customer",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Invoice belongs to user
    Invoice.belongsTo(models.User, {
      foreignKey: "id_user_create",
      as: "user_create",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Invoice belongs to user
    Invoice.belongsTo(models.User, {
      foreignKey: "id_user_approve",
      as: "user_approve",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Invoice belongs to user
    Invoice.belongsTo(models.User, {
      foreignKey: "id_user_reject",
      as: "user_reject",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Invoice has many Invoice Services
    Invoice.hasMany(models.InvoiceService, {
      foreignKey: "id_invoice",
      as: "invoice_services",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Invoice has many Invoice Verification Progress
    Invoice.hasMany(models.InvoiceVerificationProgress, {
      foreignKey: "id_invoice",
      as: "verification_progress",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Invoice has many Debit Note
    Invoice.hasMany(models.DebitNote, {
      foreignKey: "id_invoice",
      as: "debit_notes",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Invoice;
};
