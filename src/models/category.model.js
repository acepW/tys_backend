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
      category_name_indo: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Name of the category in Indonesian",
      },
      category_name_mandarin: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Name of the category in Mandarin",
      },
      foot_note: {
        type: DataTypes.TEXT("long"),
        allowNull: true,
        comment: "Footnote for the category",
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
          name: "idx_category_name_indo",
          fields: ["category_name_indo"],
        },
        {
          name: "idx_category_name_mandarin",
          fields: ["category_name_mandarin"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    }
  );

  // Define associations
  Category.associate = (models) => {
    // Category has many Product
    Category.hasMany(models.Product, {
      foreignKey: "id_category",
      as: "products",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Category has many Service Pricing
    Category.hasMany(models.ServicePricing, {
      foreignKey: "id_category",
      as: "service_pricing",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Category has many Quotation Category
    Category.hasMany(models.QuotationCategory, {
      foreignKey: "id_category",
      as: "quotation_category",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Category has many Flow Process
    Category.hasMany(models.FlowProcess, {
      foreignKey: "id_category",
      as: "flow_process",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Category;
};
