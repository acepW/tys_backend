const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Vendor = sequelize.define(
    "Vendor",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Vendor",
      },
      vendor_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Vendor Vendor name",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Vendor (active/inactive)",
      },
    },
    {
      tableName: "vendors",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_vendor_name",
          fields: ["vendor_name"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  Vendor.associate = (models) => {
    // Contoh: Vendor dapat memiliki relasi dengan Order, dll
    // Vendor.hasMany(models.Order, { ... });

    //Vendor has many Payment Requests
    Vendor.hasMany(models.PaymentRequest, {
      foreignKey: "id_vendor",
      as: "payment_requests",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Vendor;
};
