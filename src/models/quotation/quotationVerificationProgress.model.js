const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const QuotationVerificationProgress = sequelize.define(
    "QuotationVerificationProgress",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Quotation Verification Progress",
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
      id_user: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "Foreign key to users table",
      },
      status: {
        type: DataTypes.ENUM(""),
        allowNull: false,
        comment: "Description is BAB for Indonesian",
      },
      note: {
        type: DataTypes.TEXT("long"),
        allowNull: true,
        comment: "Description is BAB for Mandarin",
      },
      status: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Status of Quotation Progress",
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of QuotationVerificationProgress (active/inactive)",
      },
    },
    {
      tableName: "quotation_verification_progress",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_quotation",
          fields: ["id_quotation"],
        },
        {
          name: "idx_id_user",
          fields: ["id_user"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  QuotationVerificationProgress.associate = (models) => {
    // Contoh: QuotationVerificationProgress dapat memiliki relasi dengan Order, dll
    // QuotationVerificationProgress.hasMany(models.Order, { ... });

    //Quotation Verification Progress belongs to Quotation
    QuotationVerificationProgress.belongsTo(models.Quotation, {
      foreignKey: "id_quotation",
      as: "quotation",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Quotation Verification Progress belongs to User
    QuotationVerificationProgress.belongsTo(models.User, {
      foreignKey: "id_user",
      as: "user",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return QuotationVerificationProgress;
};
