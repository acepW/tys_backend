const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProductFields = sequelize.define(
    "ProductFields",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for product",
      },
      id_quotation_product: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "quotation_product",
          key: "id",
        },
        comment: "Product id from quotation_products table",
      },
      field_name_indo: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Fields name for Indonesian",
      },
      field_name_mandarin: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Fields name for Mandarin",
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
      value_indo: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "result value for Indonesian",
      },
      value_mandarin: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "result value for Indonesian",
      },
    },
    {
      tableName: "quotation_product_field",
      timestamps: true,
      underscored: true,
    }
  );

  // Define associations
  ProductFields.associate = (models) => {
    // Product Fields belongs to Product
    ProductFields.belongsTo(models.QuotationProduct, {
      foreignKey: "id_quotation_product",
      as: "quotation_product",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ProductFields;
};
