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
