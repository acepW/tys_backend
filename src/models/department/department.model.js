const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Department = sequelize.define(
    "Department",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Department",
      },
      department_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Department name",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Department (active/inactive)",
      },
    },
    {
      tableName: "departments",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_department_name",
          fields: ["department_name"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    }
  );

  // Define associations (untuk future development)
  Department.associate = (models) => {
    // Contoh: Department dapat memiliki relasi dengan Order, dll
    // Department.hasMany(models.Order, { ... });

    //Department has many Users
    Department.hasMany(models.User, {
      foreignKey: "id_department",
      as: "users",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Department has many Vendor
    Department.hasMany(models.Vendor, {
      foreignKey: "id_department_request",
      as: "vendor_department_request",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Department has many payment request
    Department.hasMany(models.PaymentRequest, {
      foreignKey: "id_department_request",
      as: "payment_department_request",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Department;
};
