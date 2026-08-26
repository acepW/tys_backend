const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const QuotationProductTable = sequelize.define(
    "QuotationProductTable",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Quotation Product",
      },
      id_quotation_product: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "quotation_product",
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
      tableName: "quotation_product_table",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_quotation_product",
          fields: ["id_quotation_product"],
        },
      ],
    },
  );

  // Define associations
  QuotationProductTable.associate = (models) => {
    // QuotationProductTable has many Quotation Product field
    QuotationProductTable.hasMany(models.QuotationProductField, {
      foreignKey: "id_quotation_product_table",
      as: "fields",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return QuotationProductTable;
};
