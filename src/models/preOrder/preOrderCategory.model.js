const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PreOrderCategory = sequelize.define(
    "PreOrderCategory",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for PreOrder Category",
      },
      id_pre_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "pre_orders",
          key: "id",
        },
        comment: "Foreign key to pre_orders table",
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
      tableName: "pre_order_category",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_pre_order",
          fields: ["id_pre_order"],
        },
        {
          name: "idx_id_category",
          fields: ["id_category"],
        },
      ],
    },
  );

  // Define associations
  PreOrderCategory.associate = (models) => {
    // PreOrderCategory belongs to PreOrder
    PreOrderCategory.belongsTo(models.PreOrder, {
      foreignKey: "id_pre_order",
      as: "pre_order",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderCategory belongs to Category
    PreOrderCategory.belongsTo(models.Category, {
      foreignKey: "id_category",
      as: "category",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderCategory has many PreOrder Service
    PreOrderCategory.hasMany(models.PreOrderService, {
      foreignKey: "id_pre_order_category",
      as: "services",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderCategory has many PreOrder Product
    PreOrderCategory.hasMany(models.PreOrderProduct, {
      foreignKey: "id_pre_order_category",
      as: "products",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return PreOrderCategory;
};
