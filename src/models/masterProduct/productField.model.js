const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProductFields = sequelize.define(
    "Product_fields",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for product",
      },
      id_product: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "products",
          key: "id",
        },
        comment: "Product id from product table",
      },
      field_name: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Fields name in Mandarin",
      },
    },
    {
      tableName: "products_fields",
      timestamps: true,
      underscored: true,
    }
  );

  // Define associations
  ProductFields.associate = (models) => {
    // Product Fields belongs to Product
    ProductFields.belongsTo(models.Category, {
      foreignKey: "id_product",
      as: "product",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ProductFields;
};
