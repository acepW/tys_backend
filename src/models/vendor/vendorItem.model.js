const { DataTypes } = require("sequelize");

// Goods a vendor supplies. Same shape as VendorService, but category is free text
// and each item carries its tax flags.
module.exports = (sequelize) => {
  const taxFlag = (comment) => ({
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment,
  });

  const VendorItem = sequelize.define(
    "VendorItem",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_vendor: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "vendors",
          key: "id",
        },
        comment: "Foreign key to vendors table",
      },
      category: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Item category (free text)",
      },
      item_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Vendor item name",
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
      tax_ppn: taxFlag("Subject to PPN"),
      tax_pph_23: taxFlag("Subject to PPh 23"),
      tax_pp_20: taxFlag("Subject to PP 20"),
      tax_pph_4_ayat_2: taxFlag("Subject to PPh 4 ayat 2"),
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of item (active/inactive)",
      },
    },
    {
      tableName: "vendor_items",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_vendor_items_id_vendor",
          fields: ["id_vendor"],
        },
        {
          name: "idx_vendor_items_is_active",
          fields: ["is_active"],
        },
      ],
    },
  );

  VendorItem.associate = (models) => {
    VendorItem.belongsTo(models.Vendor, {
      foreignKey: "id_vendor",
      as: "vendor",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return VendorItem;
};
