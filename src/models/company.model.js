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
