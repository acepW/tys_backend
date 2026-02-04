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
        comment: "Fields name",
      },
      field_type: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Fields type like text, number,dropdown etc.",
      },
      field_value: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "Fields value like for value dropdown etc.",
        get() {
          const raw = this.getDataValue("field_value");
          try {
            return JSON.parse(raw);
          } catch {
            return raw;
          }
        },
      },
    },
    {
      tableName: "products_fields",
      timestamps: true,
      underscored: true,
    },
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
