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
      company_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Customer company name",
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Customer address",
      },
      contact: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: "Customer contact number",
      },
      email: {
        type: DataTypes.STRING(100),
        allowNull: true,
        validate: {
          isEmail: {
            msg: "Must be a valid email address",
          },
        },
        comment: "Customer email address",
      },
      pic_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Person in Charge name",
      },
      pic_position: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Person in Charge position",
      },
      director_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Director name",
      },
      director_position: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Director position",
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
  Customer.associate = (models) => {
    // Contoh: Customer dapat memiliki relasi dengan Order, dll
    // Customer.hasMany(models.Order, { ... });
  };

  return Customer;
};
