const { DataTypes, Transaction } = require("sequelize");

module.exports = (sequelize) => {
  const VendorEdit = sequelize.define(
    "VendorEdit",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for VendorEdit",
      },
      id_vendor: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "vendors",
          key: "id",
        },
        comment: "Foreign key to vendors table",
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
        comment: "VendorEdit VendorEdit name",
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
        comment: " VendorEdit name",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Status of VendorEdit (active/inactive)",
      },
    },
    {
      tableName: "vendor_edit",
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
    },
  );

  // Define associations (untuk future development)
  VendorEdit.associate = (models) => {
    // Contoh: VendorEdit dapat memiliki relasi dengan Order, dll
    // VendorEdit.hasMany(models.Order, { ... })

    //VendorEdit Belongs to Vendor
    VendorEdit.belongsTo(models.Vendor, {
      foreignKey: "id_vendor",
      as: "vendor",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //VendorEdit Belongs to User
    VendorEdit.belongsTo(models.User, {
      foreignKey: "id_user_request",
      as: "user_request",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //VendorEdit Belongs to Department
    VendorEdit.belongsTo(models.Department, {
      foreignKey: "id_department_request",
      as: "department_request",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //VendorEdit has many VendorEdit Service
    VendorEdit.hasMany(models.VendorServiceEdit, {
      foreignKey: "id_vendor_edit",
      as: "vendor_service_edits",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return VendorEdit;
};
