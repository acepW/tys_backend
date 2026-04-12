const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PaymentRequest = sequelize.define(
    "PaymentRequest",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Payment Request",
      },
      id_contract: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "contracts",
          key: "id",
        },
        comment: "Id contract from contract",
      },
      id_contract_service: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "contract_service",
          key: "id",
        },
        comment: "Foreign key for Contract Service",
      },
      id_contract_project_plan: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "contract_project_plan",
          key: "id",
        },
        comment: "Foreign key for Contract Project Plan",
      },
      id_company: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "companies",
          key: "id",
        },
        comment: "Foreign key for Company",
      },
      id_customer: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "customers",
          key: "id",
        },
        comment: "Foreign key for Customer",
      },
      id_user_request: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "Id user who created the service pricing",
      },
      payment_request_no: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Payment request number",
      },
      payment_type: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Payment type",
      },
      vendor_name: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Vendor name",
      },
      invoice_no: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Invoice number",
      },
      payment_date: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: "Payment date",
      },
      total_payment_request: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: "Total payment request amount",
      },
      billing_id: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "Billing ID",
      },
      bank_name: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "Bank name",
      },
      account_name: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "Account name",
      },
      account_number: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "Account number",
      },
      description: {
        type: DataTypes.STRING(1000),
        allowNull: false,
        comment: "Description",
      },
      file: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "File",
      },
      payment_method: {
        type: DataTypes.ENUM("transfer", "cash"),
        allowNull: true,
        comment: "Payment method of Invoice",
      },
      total_payment: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "Total payment amount",
      },
      file_proof_payment: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "File proof of payment",
      },
      payer: {
        type: DataTypes.ENUM("company", "customer"),
        allowNull: true,
        comment: "Payer",
      },
      status: {
        type: DataTypes.ENUM(
          "pending",
          "approved",
          "rejected",
          "paid",
          "continue_to_debit_note",
        ),
        defaultValue: "pending",
        comment: "Status",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Service Pricing (active/inactive)",
      },
    },
    {
      tableName: "payment_requests",
      timestamps: true,
      underscored: true,
      indexes: [
        // FK indexes
        {
          name: "idx_id_contract", // tambahan yang kurang
          fields: ["id_contract"],
        },
        {
          name: "idx_id_contract_service",
          fields: ["id_contract_service"],
        },
        {
          name: "idx_id_contract_project_plan",
          fields: ["id_contract_project_plan"],
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
          name: "idx_id_user_request",
          fields: ["id_user_request"],
        },
        // Composite index (lebih efisien dari is_active standalone)
        {
          name: "idx_contract_active",
          fields: ["id_contract", "is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  PaymentRequest.associate = (models) => {
    // Contoh: PaymentRequest dapat memiliki relasi dengan Order, dll
    // PaymentRequest.hasMany(models.Order, { ... });

    // Payment Request belongs to Contract
    PaymentRequest.belongsTo(models.Contract, {
      foreignKey: "id_contract",
      as: "contract",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Payment Request belongs to Contract Service
    PaymentRequest.belongsTo(models.ContractService, {
      foreignKey: "id_contract_service",
      as: "contract_service",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Payment Request belongs to Contract Project Plan
    PaymentRequest.belongsTo(models.ContractProjectPlan, {
      foreignKey: "id_contract_project_plan",
      as: "contract_project_plan",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Payment Request belongs to Company
    PaymentRequest.belongsTo(models.Company, {
      foreignKey: "id_company",
      as: "company",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Payment Request belongs to Customer
    PaymentRequest.belongsTo(models.Customer, {
      foreignKey: "id_customer",
      as: "customer",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Payment Request belongs to User
    PaymentRequest.belongsTo(models.User, {
      foreignKey: "id_user_request",
      as: "user_request",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Payment Request has many PaymentRequestVerificationProgress
    PaymentRequest.hasMany(models.PaymentRequestVerificationProgress, {
      foreignKey: "id_payment_request",
      as: "verification_progress",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Payment Request has many DebitNotes
    PaymentRequest.hasMany(models.DebitNote, {
      foreignKey: "id_payment_request",
      as: "debit_notes",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return PaymentRequest;
};
