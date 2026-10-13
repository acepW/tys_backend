const { DataTypes } = require("sequelize");

// Proposed vendor item in a vendor revision. Applied to vendor_items on approve:
// with id_vendor_item it updates that item, without it a new item is created.
module.exports = (sequelize) => {
  const taxFlag = (comment) => ({
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment,
  });

  const VendorItemEdit = sequelize.define(
    "VendorItemEdit",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_vendor_edit: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "vendor_edit",
          key: "id",
        },
        comment: "Foreign key to vendor_edit table",
      },
      id_vendor_item: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "vendor_items",
          key: "id",
        },
        comment: "Vendor item being revised; null for a new item",
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
      },
    },
    {
      tableName: "vendor_items_edit",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_vendor_items_edit_id_vendor_edit",
          fields: ["id_vendor_edit"],
        },
      ],
    },
  );

  VendorItemEdit.associate = (models) => {
    VendorItemEdit.belongsTo(models.VendorEdit, {
      foreignKey: "id_vendor_edit",
      as: "vendor_edit",
    });
    VendorItemEdit.belongsTo(models.VendorItem, {
      foreignKey: "id_vendor_item",
      as: "vendor_item",
    });
  };

  return VendorItemEdit;
};
