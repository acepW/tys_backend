const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Customer = sequelize.define(
    "Customer",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for customer",
      },
      customer_type: {
        type: DataTypes.ENUM("company", "personal"),
        allowNull: false,
        comment: "Customer customer type",
      },
      company_name_indo: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Customer company name for Indonesian",
      },
      company_name_mandarin: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Customer company name for Mandarin",
      },
      is_company_name_same: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        comment:
          "For customer with same company name in Indonesian and Mandarin",
      },
      address_indo: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Customer address for Indonesian",
      },
      address_mandarin: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Customer address for Mandarin",
      },
      is_address_same: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        comment: "For customer with same address in Indonesian and Mandarin",
      },
      contact_indo: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Customer contact number for Indonesian",
      },
      contact_mandarin: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Customer contact number for Indonesian",
      },
      is_contact_same: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        comment: "For customer with same contact in Indonesian and Mandarin",
      },
      email_indo: {
        type: DataTypes.STRING(1000),
        allowNull: true,
        comment: "Customer email address for Indonesian",
      },
      email_mandarin: {
        type: DataTypes.STRING(1000),
        allowNull: true,
        comment: "Customer email address for Mandarin",
      },
      is_email_same: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        comment: "For customer with same email in Indonesian and Mandarin",
      },
      pic_name_indo: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Person in Charge name for Indonesian",
      },
      pic_name_mandarin: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Person in Charge name for Mandarin",
      },
      is_pic_name_same: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        comment: "For customer with same pic name in Indonesian and Mandarin",
      },
      pic_position_indo: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Person in Charge position for Indonesian",
      },
      pic_position_mandarin: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Person in Charge position for Mandarin",
      },
      is_pic_position_same: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        comment:
          "For customer with same pic position in Indonesian and Mandarin",
      },
      director_name_indo: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Director name for Indonesian",
      },
      director_name_mandarin: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Director name for Mandarin",
      },
      is_director_name_same: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        comment:
          "For customer with same director name in Indonesian and Mandarin",
      },
      director_position_indonesian: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Director position for Indonesian",
      },
      director_position_mandarin: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Director position for Mandarin",
      },
      is_director_position_same: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        comment:
          "For customer with same director position in Indonesian and Mandarin",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of customer (active/inactive)",
      },
    },
    {
      tableName: "customers",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_company_name_indo",
          fields: ["company_name_indo"],
        },
        {
          name: "idx_email_indo",
          fields: ["email_indo"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    }
  );

  // Define associations (untuk future development)
  Customer.associate = (models) => {
    // Contoh: Customer dapat memiliki relasi dengan Order, dll
    // Customer.hasMany(models.Order, { ... });

    // Customer has many quotations
    Customer.hasMany(models.Quotation, {
      foreignKey: "id_customer",
      as: "quotations",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Customer has many contracts
    Customer.hasMany(models.Contract, {
      foreignKey: "id_customer",
      as: "contracts",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Customer has many Invoices
    Customer.hasMany(models.Invoice, {
      foreignKey: "id_customer",
      as: "invoices",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Customer has many Debit Note
    Customer.hasMany(models.DebitNote, {
      foreignKey: "id_customer",
      as: "debit_notes",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Customer has many Payment Request
    Customer.hasMany(models.PaymentRequest, {
      foreignKey: "id_customer",
      as: "payment_requests",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Customer;
};
