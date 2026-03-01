const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Company = sequelize.define(
    "Company",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for company",
      },
      company_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Name of the company",
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Company address",
      },
      contact: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: "Company contact number",
      },
      email: {
        type: DataTypes.STRING(100),
        allowNull: true,
        validate: {
          isEmail: {
            msg: "Must be a valid email address",
          },
        },
        comment: "Company email address",
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
      initial_company: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: "Initial company flag",
      },
      director_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Director name",
      },
      main_note: {
        type: DataTypes.TEXT("long"),
        allowNull: true,
        comment: "Main note",
      },
      document_watermark: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Document watermark",
      },
      logo_header: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Logo header",
      },
      company_name_header_quotation: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Company name header for quotation",
      },
      address_header_quotation: {
        type: DataTypes.STRING(300),
        allowNull: true,
        comment: "Address header for quotation",
      },
      wechat_header_quotation: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "WeChat header for quotation",
      },
      wa_header_quotation: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "WhatsApp header for quotation",
      },
      email_header_quotation: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Email header for quotation",
      },
      company_name_header_contract: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Company name header for contract",
      },
      address_header_contract: {
        type: DataTypes.STRING(300),
        allowNull: true,
        comment: "Address header for contract",
      },
      wechat_header_contract: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "WeChat header for contract",
      },
      wa_header_contract: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "WhatsApp header for contract",
      },
      email_header_contract: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Email header for contract",
      },
      company_name_header_invoice: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Company name header for invoice",
      },
      address_header_invoice: {
        type: DataTypes.STRING(300),
        allowNull: true,
        comment: "Address header for invoice",
      },
      wechat_header_invoice: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "WeChat header for invoice",
      },
      wa_header_invoice: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "WhatsApp header for invoice",
      },
      email_header_invoice: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Email header for invoice",
      },
      bank_name_rmb: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Bank name for RMB transactions",
      },
      account_name_rmb: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Account name for RMB transactions",
      },
      account_no_rmb: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Account no for RMB transactions",
      },
      swift_no_rmb: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "SWIFT code for RMB transactions",
      },
      bank_name_idr: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Bank name for IDR transactions",
      },
      account_name_idr: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Account name for IDR transactions",
      },
      account_no_idr: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Account no for IDR transactions",
      },
      swift_no_idr: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "SWIFT code for IDR transactions",
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of company (active/inactive)",
      },
    },
    {
      tableName: "companies",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_company_name",
          fields: ["company_name"],
        },
        {
          name: "idx_email",
          fields: ["email"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  Company.associate = (models) => {
    // Contoh: Company dapat memiliki relasi dengan Order, Invoice, dll
    // Company.hasMany(models.Order, { ... });

    // Company has many quotation
    Company.hasMany(models.Quotation, {
      foreignKey: "id_company",
      as: "quotations",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Company has many contract
    Company.hasMany(models.Contract, {
      foreignKey: "id_company",
      as: "contracts",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Company;
};
