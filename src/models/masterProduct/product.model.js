const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Product = sequelize.define(
    "Product",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for product",
      },
      id_category: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "categories",
          key: "id",
        },
        comment: "Foreign key to categories table",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of product (active/inactive)",
      },
    },
    {
      tableName: "products",
      timestamps: true,
      underscored: true,
      indexes: [
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

  // Define associations
  Product.associate = (models) => {
    // Product belongs to Category
    Product.belongsTo(models.Category, {
      foreignKey: "id_category",
      as: "category",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Product belongs to Product Fields
    Product.hasMany(models.ProductFields, {
      foreignKey: "id_product",
      as: "product_fields",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Product;
};
