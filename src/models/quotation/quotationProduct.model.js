const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const QuotationProduct = sequelize.define(
    "QuotationProduct",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Quotation Product",
      },
      id_quotation_category: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "quotation_category",
          key: "id",
        },
        comment: "Foreign key to quotation category table",
      },
      index: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "index for ordering the products in the quotation category",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Quotation Category (active/inactive)",
      },
    },
    {
      tableName: "quotation_product",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_quotation_category",
          fields: ["id_quotation_category"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    }
  );

  // Define associations
  QuotationProduct.associate = (models) => {
    // QuotationProduct belongs to Quotation Category
    QuotationProduct.belongsTo(models.QuotationCategory, {
      foreignKey: "id_quotation_category",
      as: "quotation_category",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // QuotationProduct has many Quotation Product field
    QuotationProduct.hasMany(models.QuotationProductField, {
      foreignKey: "id_quotation_product",
      as: "fields",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return QuotationProduct;
};
