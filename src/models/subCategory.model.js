const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const SubCategory = sequelize.define(
    "SubCategory",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for sub category",
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
      sub_category_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Name of the sub category",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of sub category (active/inactive)",
      },
    },
    {
      tableName: "sub_categories",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_sub_category_name",
          fields: ["sub_category_name"],
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

  // Define associations
  SubCategory.associate = (models) => {
    // SubCategory belongs to Category
    SubCategory.belongsTo(models.Category, {
      foreignKey: "id_category",
      as: "category",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // SubCategory has many Product
    SubCategory.hasMany(models.Product, {
      foreignKey: "id_sub_category",
      as: "products",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return SubCategory;
};
