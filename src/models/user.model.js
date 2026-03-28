const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Users = sequelize.define(
    "Users",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Users",
      },
      id_division: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "divisions",
          key: "id",
        },
        comment: "Id division from divisions",
      },
      email: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
        comment: "Users name",
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Users name",
      },
      password: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Users password",
      },
      role: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Users role",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Users (active/inactive)",
      },
    },
    {
      tableName: "users",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_division",
          fields: ["id_division"],
        },
        {
          name: "idx_email",
          fields: ["email"],
        },
        {
          name: "idx_role",
          fields: ["role"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  Users.associate = (models) => {
    // Contoh: Users dapat memiliki relasi dengan Order, dll
    // Users.hasMany(models.Order, { ... });

    //Users belongs to Division
    Users.belongsTo(models.Division, {
      foreignKey: "id_division",
      as: "division",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Service Pricing
    Users.hasMany(models.ServicePricing, {
      foreignKey: "id_user_create",
      as: "created_service_pricing",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Service Pricing
    Users.hasMany(models.ServicePricing, {
      foreignKey: "id_user_approve",
      as: "approved_service_pricing",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Service Pricing
    Users.hasMany(models.ServicePricing, {
      foreignKey: "id_user_reject",
      as: "rejected_service_pricing",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Quotation
    Users.hasMany(models.Quotation, {
      foreignKey: "id_user_create",
      as: "created_quotation",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Quotation
    Users.hasMany(models.Quotation, {
      foreignKey: "id_user_approve",
      as: "approved_quotation",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Quotation
    Users.hasMany(models.Quotation, {
      foreignKey: "id_user_reject",
      as: "rejected_quotation",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Contract Verification Progress
    Users.hasMany(models.ContractVerificationProgress, {
      foreignKey: "id_user",
      as: "verification_progress",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Invoice
    Users.hasMany(models.Invoice, {
      foreignKey: "id_user_create",
      as: "created_invoice",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Invoice
    Users.hasMany(models.Invoice, {
      foreignKey: "id_user_approve",
      as: "approved_invoice",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Invoice
    Users.hasMany(models.Invoice, {
      foreignKey: "id_user_reject",
      as: "rejected_invoice",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Invoice Verification Progress
    Users.hasMany(models.InvoiceVerificationProgress, {
      foreignKey: "id_user",
      as: "invoice_verification_progress",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Debit Note
    Users.hasMany(models.DebitNote, {
      foreignKey: "id_user_create",
      as: "created_debit_note",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Debit Note
    Users.hasMany(models.DebitNote, {
      foreignKey: "id_user_approve",
      as: "approved_debit_note",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Debit Note
    Users.hasMany(models.DebitNote, {
      foreignKey: "id_user_reject",
      as: "rejected_debit_note",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many contract plan (started)
    Users.hasMany(models.ContractProjectPlan, {
      foreignKey: "id_user_started",
      as: "started_contract_plans",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many contract plan (stopped)
    Users.hasMany(models.ContractProjectPlan, {
      foreignKey: "id_user_stopped",
      as: "stopped_contract_plans",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many contract plan point
    Users.hasMany(models.ContractProjectPlanPoint, {
      foreignKey: "id_user",
      as: "contract_plan_points",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Users;
};
