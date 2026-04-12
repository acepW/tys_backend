const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const DebitNote = sequelize.define(
    "DebitNote",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for DebitNote",
      },
      id_payment_request: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "payment_requests",
          key: "id",
        },
        comment: "Foreign key to payment_requests table",
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
      id_invoice: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "invoices",
          key: "id",
        },
        comment: "Foreign key to invoice table",
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
      id_user_paid: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "Id user who paid the debit note",
      },
      date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: "Date of DebitNote",
      },
      debit_note_no: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "No of Debit Note",
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
      payment_date: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Payment date of Invoice",
      },
      payment_amount: {
        type: DataTypes.DECIMAL(15, 0),
        allowNull: true,
        comment: "Payment amount of Invoice",
      },
      payment_method: {
        type: DataTypes.ENUM("transfer", "cash"),
        allowNull: true,
        comment: "Payment method of Invoice",
      },
      proof_of_payment: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "Proof of payment for Invoice",
      },
      status: {
        type: DataTypes.ENUM("pending", "rejected", "approved", "paid"),
        allowNull: false,
        defaultValue: "pending",
        comment: "Status of DebitNote",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of DebitNote (active/inactive)",
      },
    },
    {
      tableName: "debit_notes",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_payment_request",
          fields: ["id_payment_request"],
        },
        {
          name: "idx_id_quotation",
          fields: ["id_quotation"],
        },
        {
          name: "idx_id_contract",
          fields: ["id_contract"],
        },
        {
          name: "idx_id_invoice",
          fields: ["id_invoice"],
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
          name: "idx_debit_note_no",
          fields: ["debit_note_no"],
        },
        // Composite Index
        { name: "idx_company_active", fields: ["id_company", "is_active"] },
        { name: "idx_status_active", fields: ["status", "is_active"] },
      ],
    },
  );

  // Define associations
  DebitNote.associate = (models) => {
    // DebitNote belongs to PaymentRequest
    DebitNote.belongsTo(models.PaymentRequest, {
      foreignKey: "id_payment_request",
      as: "payment_request",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    // DebitNote belongs to Quotation
    DebitNote.belongsTo(models.Quotation, {
      foreignKey: "id_quotation",
      as: "quotation",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // DebitNote belongs to Contract
    DebitNote.belongsTo(models.Contract, {
      foreignKey: "id_contract",
      as: "contract",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // DebitNote belongs to invoice
    DebitNote.belongsTo(models.Invoice, {
      foreignKey: "id_invoice",
      as: "invoice",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // DebitNote belongs to Company
    DebitNote.belongsTo(models.Company, {
      foreignKey: "id_company",
      as: "company",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // DebitNote belongs to Customer
    DebitNote.belongsTo(models.Customer, {
      foreignKey: "id_customer",
      as: "customer",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //DebitNote belongs to user
    DebitNote.belongsTo(models.User, {
      foreignKey: "id_user_create",
      as: "user_create",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //DebitNote belongs to user
    DebitNote.belongsTo(models.User, {
      foreignKey: "id_user_approve",
      as: "user_approve",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //DebitNote belongs to user
    DebitNote.belongsTo(models.User, {
      foreignKey: "id_user_reject",
      as: "user_reject",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //DebitNote belongs to user
    DebitNote.belongsTo(models.User, {
      foreignKey: "id_user_paid",
      as: "user_paid",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Debit Note has many debit notes item
    DebitNote.hasMany(models.DebitNoteItem, {
      foreignKey: "id_debit_note",
      as: "debit_note_items",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return DebitNote;
};
