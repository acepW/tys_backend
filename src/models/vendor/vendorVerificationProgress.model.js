const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const VendorVerificationProgress = sequelize.define(
    "VendorVerificationProgress",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Payment Request Verification Progress",
      },
      id_vendor: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "vendors",
          key: "id",
        },
        comment: "Foreign key to vendors table",
      },
      id_user: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "Foreign key to users table",
      },

      note: {
        type: DataTypes.TEXT("long"),
        allowNull: true,
        comment: "Description is BAB for Mandarin",
      },
      status: {
        type: DataTypes.ENUM("requested", "approve", "reject"),
        allowNull: false,
        comment: "status of VendorVerificationProgress",
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of VendorVerificationProgress (active/inactive)",
      },
    },
    {
      tableName: "vendor_verification_progress",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_vendor",
          fields: ["id_vendor"],
        },
        {
          name: "idx_id_user",
          fields: ["id_user"],
        },
      ],
    }
  );

  // Define associations (untuk future development)
  VendorVerificationProgress.associate = (models) => {
    // Contoh: VendorVerificationProgress dapat memiliki relasi dengan Order, dll
    // VendorVerificationProgress.hasMany(models.Order, { ... });

    //Payment Request Verification Progress belongs to Payment Request
    VendorVerificationProgress.belongsTo(models.Vendor, {
      foreignKey: "id_payment_request",
      as: "payment_request",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Payment Request Verification Progress belongs to User
    VendorVerificationProgress.belongsTo(models.User, {
      foreignKey: "id_user",
      as: "user",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return VendorVerificationProgress;
};
