const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PreOrderProduct = sequelize.define(
    "PreOrderProduct",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for PreOrder Product",
      },
      id_pre_order_category: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "pre_order_category",
          key: "id",
        },
        comment: "Foreign key to pre_order_category table",
      },
      id_pre_order_service: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "pre_order_service",
          key: "id",
        },
        comment: "Foreign key to pre_order_service table",
      },
      index: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "index for ordering the products in the pre_order_category",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of PreOrder Category (active/inactive)",
      },
    },
    {
      tableName: "pre_order_product",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_pre_order_category",
          fields: ["id_pre_order_category"],
        },
      ],
    },
  );

  // Define associations
  PreOrderProduct.associate = (models) => {
    // PreOrderProduct belongs to PreOrder Category
    PreOrderProduct.belongsTo(models.PreOrderCategory, {
      foreignKey: "id_pre_order_category",
      as: "pre_order_category",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderProduct belongs to PreOrder Service
    PreOrderProduct.belongsTo(models.PreOrderService, {
      foreignKey: "id_pre_order_service",
      as: "pre_order_service",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderProduct has many PreOrder Product field
    PreOrderProduct.hasMany(models.PreOrderProductField, {
      foreignKey: "id_pre_order_product",
      as: "fields",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return PreOrderProduct;
};
