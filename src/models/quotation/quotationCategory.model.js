const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const QuotationCategory = sequelize.define(
    "QuotationCategory",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Quotation Category",
      },
      id_quotation: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "quotations",
          key: "id",
        },
        comment: "Foreign key to quotations table",
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
      foot_note: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
        comment: "Quotation foot note for the category",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Quotation Category (active/inactive)",
      },
    },
    {
      tableName: "quotation_category",
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
    }
  );

  // Define associations
  QuotationCategory.associate = (models) => {
    // QuotationCategory belongs to Quotation
    QuotationCategory.belongsTo(models.Quotation, {
      foreignKey: "id_quotation",
      as: "quotation",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // QuotationCategory belongs to Category
    QuotationCategory.belongsTo(models.Category, {
      foreignKey: "id_category",
      as: "category",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // QuotationCategory has many Quotation Service
    QuotationCategory.hasMany(models.QuotationService, {
      foreignKey: "id_quotation_category",
      as: "services",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // QuotationCategory has many Quotation Product
    QuotationCategory.hasMany(models.QuotationProduct, {
      foreignKey: "id_quotation_category",
      as: "products",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return QuotationCategory;
};
