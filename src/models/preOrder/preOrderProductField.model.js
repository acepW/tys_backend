const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PreOrderProductFields = sequelize.define(
    "PreOrderProductFields",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for preOrder product",
      },
      id_pre_order_product: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "pre_order_product",
          key: "id",
        },
        comment: "Product id from pre_order_product table",
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
      tableName: "pre_order_product_field",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_pre_order_product",
          fields: ["id_pre_order_product"],
        },
      ],
    },
  );

  // Define associations
  PreOrderProductFields.associate = (models) => {
    // Product Fields belongs to Product
    PreOrderProductFields.belongsTo(models.PreOrderProduct, {
      foreignKey: "id_pre_order_product",
      as: "pre_order_product",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return PreOrderProductFields;
};
