const { DataTypes, Transaction } = require("sequelize");

module.exports = (sequelize) => {
  const Vendor = sequelize.define(
    "Vendor",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Vendor",
      },
      id_user_request: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "Foreign key to users table",
      },
      id_department_request: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "departments",
          key: "id",
        },
        comment: "Foreign key to users table",
      },
      vendor_application_no: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Vendor application no",
      },
      date_request: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
        comment: "Date Request",
      },
      vendor_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Vendor Vendor name",
      },
      pic_name: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Pic name",
      },
      npwp: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "NPWP",
      },
      nib: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "NIB",
      },
      email: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Email",
      },
      phone_number: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Phone number",
      },
      type_of_service: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Type of service vendor",
      },
      bank_name: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Bank name",
      },
      account_number: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Account Number",
      },
      account_holder_name: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Account holder name",
      },
      bank_branch: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Bank Branch",
      },
      transaction_currency: {
        type: DataTypes.ENUM("idr", "rmb"),
        allowNull: true,
        comment: "Currency for transaction",
      },
      file: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "File",
      },
      status: {
        type: DataTypes.ENUM("pending", "approve", "reject"),
        allowNull: false,
        comment: "Vendor Vendor name",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Status of Vendor (active/inactive)",
      },
    },
    {
      tableName: "vendors",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_vendor_name",
          fields: ["vendor_name"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    }
  );

  // Define associations (untuk future development)
  Vendor.associate = (models) => {
    // Contoh: Vendor dapat memiliki relasi dengan Order, dll
    // Vendor.hasMany(models.Order, { ... })

    //Vendor Belongs to User
    Vendor.belongsTo(models.User, {
      foreignKey: "id_user_request",
      as: "user_request",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Vendor Belongs to Department
    Vendor.belongsTo(models.Department, {
      foreignKey: "id_department_request",
      as: "department_request",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Vendor has many Vendor Service
    Vendor.hasMany(models.VendorService, {
      foreignKey: "id_vendor",
      as: "vendor_service",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Vendor has many Payment Requests
    Vendor.hasMany(models.VendorVerificationProgress, {
      foreignKey: "id_vendor",
      as: "verification_progress",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Vendor has many ProjectPlan
    Vendor.hasMany(models.PaymentRequest, {
      foreignKey: "id_vendor",
      as: "payment_requests",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Vendor has many ProjectPlan
    Vendor.hasMany(models.ProjectPlanCost, {
      foreignKey: "id_vendor",
      as: "project_plans_cost",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Vendor has many ContractProjectPlan
    Vendor.hasMany(models.ContractProjectPlanCost, {
      foreignKey: "id_vendor",
      as: "contract_project_plans_cost",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Vendor;
};
