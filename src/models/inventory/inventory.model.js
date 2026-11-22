const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Inventory = sequelize.define(
    "Inventory",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_master_item: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "master_items", key: "id" },
        comment: "Master item; NULL for rows created before the master existed",
      },
      product_code: {
        type: DataTypes.STRING(30),
        allowNull: true,
        comment:
          "Product code <item_code>-00001, given when the row is created from a master item; a moved row keeps it",
      },
      item_name: { type: DataTypes.STRING(500), allowNull: false },
      brand: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Brand (merk) of the item",
      },
      model_number: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Model number of the item",
      },
      serial_number: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Serial number (no seri) of one unit, from the goods receipt; a row with one holds quantity 1",
      },
      size: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Size (ukuran) of the item",
      },
      material: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Material (bahan) of the item",
      },
      other: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Other specification (lainnya) of the item",
      },
      purchase_request_category: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      asset_category: {
        type: DataTypes.ENUM("asset", "non asset"),
        allowNull: true,
      },
      quantity_unit: { type: DataTypes.STRING(100), allowNull: false },
      quantity: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: "Current stock quantity",
      },
      received_date: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Date the stock that created this row was received (tanggal penerimaan)",
      },
      id_company: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "companies", key: "id" },
        comment: "Company owning the stock; NULL for rows created before it existed",
      },
      id_inventory_location: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "inventory_locations", key: "id" },
        comment: "Where the stock is stored; NULL for rows created before it existed",
      },
      movement_status: {
        type: DataTypes.ENUM("stock transfer", "stock allocation"),
        allowNull: true,
        comment:
          "Type of the last approved inventory movement into or out of this row; NULL when never moved",
      },
    },
    {
      tableName: "inventories",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["item_name"] },
        { fields: ["id_company", "id_inventory_location"] },
        { fields: ["product_code"] },
        { fields: ["id_master_item", "serial_number"] },
      ],
    },
  );
  Inventory.associate = (models) => {
    Inventory.belongsTo(models.MasterItem, {
      foreignKey: "id_master_item",
      as: "master_item",
    });
    Inventory.belongsTo(models.Company, {
      foreignKey: "id_company",
      as: "company",
    });
    Inventory.belongsTo(models.InventoryLocation, {
      foreignKey: "id_inventory_location",
      as: "inventory_location",
    });
    Inventory.hasMany(models.InventoryHistory, {
      foreignKey: "id_inventory",
      as: "histories",
    });
    Inventory.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: "inventories", category: "files_product" },
      as: "files_product",
    });
  };
  return Inventory;
};
