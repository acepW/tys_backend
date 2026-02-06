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
      tax: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Tax applicable flag",
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
  };

  return Company;
};
