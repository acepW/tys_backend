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
      product_name_indo: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Product name in Indonesian",
      },
      product_name_mandarin: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Product name in Mandarin",
      },
      qty: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        validate: {
          min: {
            args: [0],
            msg: "Quantity cannot be negative",
          },
        },
        comment: "Product quantity in stock",
      },
      category_indo: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Category description in Indonesian",
      },
      category_mandarin: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Category description in Mandarin",
      },
      total_color: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        validate: {
          min: {
            args: [0],
            msg: "Total color cannot be negative",
          },
        },
        comment: "Total color variations available",
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
      id_sub_category: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "sub_categories",
          key: "id",
        },
        comment: "Foreign key to sub_categories table",
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
          name: "idx_product_name_indo",
          fields: ["product_name_indo"],
        },
        {
          name: "idx_id_category",
          fields: ["id_category"],
        },
        {
          name: "idx_id_sub_category",
          fields: ["id_sub_category"],
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

    // Product belongs to SubCategory
    Product.belongsTo(models.SubCategory, {
      foreignKey: "id_sub_category",
      as: "subCategory",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Product;
};
