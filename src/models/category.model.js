const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Category = sequelize.define(
    "Category",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for category",
      },
      category_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Name of the category",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of category (active/inactive)",
      },
    },
    {
      tableName: "categories",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_category_name",
          fields: ["category_name"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    },
  );

  // Define associations
  Category.associate = (models) => {
    // Category has many SubCategory
    Category.hasMany(models.SubCategory, {
      foreignKey: "id_category",
      as: "subCategories",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Category has many Product
    Category.hasMany(models.Product, {
      foreignKey: "id_category",
      as: "products",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Category;
};
