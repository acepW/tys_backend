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
      id_user_create: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "Foreign key to users table",
      },
      id_user_approve: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "Id user who approve the service pricing",
      },
      id_user_reject: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "Id user who reject the service pricing",
      },
      date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
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
          fields: [{ name: "quotation_title_indo", length: 100 }],
        },
        {
          name: "idx_id_user_create",
          fields: ["id_user_create"],
        },
        {
          name: "idx_id_user_approve",
          fields: ["id_user_approve"],
        },
        {
          name: "idx_id_user_reject",
          fields: ["id_user_reject"],
        },
        // Composite index
        {
          name: "idx_company_active",
          fields: ["id_company", "is_active"],
        },
      ],
    },
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

    // Quotation has many Quotation payment
    Quotation.hasMany(models.QuotationPayment, {
      foreignKey: "id_quotation",
      as: "quotation_payment",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Quotation belongs to user
    Quotation.belongsTo(models.User, {
      foreignKey: "id_user_create",
      as: "user_create",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Quotation belongs to user
    Quotation.belongsTo(models.User, {
      foreignKey: "id_user_approve",
      as: "user_approve",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Quotation belongs to user
    Quotation.belongsTo(models.User, {
      foreignKey: "id_user_reject",
      as: "user_reject",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Quotation;
};
