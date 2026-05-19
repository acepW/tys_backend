const { DataTypes, Transaction } = require("sequelize");

module.exports = (sequelize) => {
  const VendorServiceEdit = sequelize.define(
    "VendorServiceEdit",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Vendor",
      },
      id_vendor_edit: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "vendor_edit",
          key: "id",
        },
        comment: "Foreign key to id_vendor_edit table",
      },
      id_vendor_service: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "vendor_services",
          key: "id",
        },
        comment: "Foreign key to vendor_services table",
      },
      id_category: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "categories",
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
        type: DataTypes.DECIMAL(15, 0),
        comment: "Price in IDR",
      },
      price_rmb: {
        allowNull: false,
        type: DataTypes.DECIMAL(15, 0),
        comment: "Price in RMB",
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Vendor (active/inactive)",
      },
    },
    {
      tableName: "vendor_services_edit",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_vendor_edit",
          fields: ["id_vendor_edit"],
        },
        {
          name: "idx_id_category",
          fields: ["id_category"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  VendorServiceEdit.associate = (models) => {
    // Contoh: VendorServiceEdit dapat memiliki relasi dengan Order, dll
    // VendorServiceEdit.hasMany(models.Order, { ... })

    //VendorServiceEdit Belongs to Vendor
    VendorServiceEdit.belongsTo(models.Vendor, {
      foreignKey: "id_vendor_edit",
      as: "vendor_edit",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //VendorServiceEdit Belongs to Vendor
    VendorServiceEdit.belongsTo(models.VendorService, {
      foreignKey: "id_vendor_service",
      as: "vendor_service",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //VendorServiceEdit Belongs to Categories
    VendorServiceEdit.belongsTo(models.Category, {
      foreignKey: "id_category",
      as: "category",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return VendorServiceEdit;
};
