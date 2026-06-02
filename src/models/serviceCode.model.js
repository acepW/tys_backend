const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ServiceCode = sequelize.define(
    "ServiceCode",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for ServiceCode",
      },
      service_code: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Service Code",
      },
      description: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Service Code Description",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of ServiceCode (active/inactive)",
      },
    },
    {
      tableName: "service_codes",
      timestamps: true,
      underscored: true,
    },
  );

  // Define associations (untuk future development)
  ServiceCode.associate = (models) => {
    // Contoh: ServiceCode dapat memiliki relasi dengan Order, dll
    // ServiceCode.hasMany(models.Order, { ... });
  };

  return ServiceCode;
};
