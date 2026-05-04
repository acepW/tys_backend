const { DataTypes, Transaction } = require("sequelize");

module.exports = (sequelize) => {
  const VendorService = sequelize.define(
    "VendorService",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Vendor",
      },
      id_vendor: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "vendors",
          key: "id",
        },
        comment: "Foreign key to users table",
      },
      service_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Vendor service name",
      },
      price_idr: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "Price in IDR",
      },
      price_rmb: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "Price in RMB",
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Status of Vendor (active/inactive)",
      },
    },
    {
      tableName: "vendor_services",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_vendor",
          fields: ["id_vendor"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    }
  );

  // Define associations (untuk future development)
  VendorService.associate = (models) => {
    // Contoh: VendorService dapat memiliki relasi dengan Order, dll
    // VendorService.hasMany(models.Order, { ... })

    //VendorService Belongs to Vendor
    VendorService.belongsTo(models.Vendor, {
      foreignKey: "id_user",
      as: "user_request",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return VendorService;
};
