const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Quotation = sequelize.define(
    "Quotation",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Quotation",
      },
      id_company: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "companies",
          key: "id",
        },
        comment: "Foreign key to companies table",
      },
      id_customer: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "customers",
          key: "id",
        },
        comment: "Foreign key to companies table",
      },
      date: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: "Date of quotation",
      },
      quotation_no: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "No of quotation",
      },
      quotation_title_indo: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Quotation title for Indonesian",
      },
      quotation_title_mandarin: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Quotation title for Mandarin",
      },
      status: {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "pending",
        comment: "Status of quotation",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Quotation (active/inactive)",
      },
    },
    {
      tableName: "quotations",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_company",
          fields: ["id_company"],
        },
        {
          name: "idx_id_customer",
          fields: ["id_customer"],
        },
        {
          name: "idx_quotation_no",
          fields: ["quotation_no"],
        },
        {
          name: "idx_quotation_title_indo",
          fields: ["quotation_title_indo"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    }
  );

  // Define associations
  Quotation.associate = (models) => {
    // Quotation belongs to Company
    Quotation.belongsTo(models.Company, {
      foreignKey: "id_company",
      as: "company",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Quotation belongs to Customer
    Quotation.belongsTo(models.Customer, {
      foreignKey: "id_customer",
      as: "customer",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Quotation has many quotation category
    Quotation.hasMany(models.QuotationCategory, {
      foreignKey: "id_quotation",
      as: "quotation_category",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Quotation has many Contract
    Quotation.hasMany(models.Contract, {
      foreignKey: "id_quotation",
      as: "contracts",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Quotation;
};
