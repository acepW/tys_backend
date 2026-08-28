const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PreOrderProductTable = sequelize.define(
    "PreOrderProductTable",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for PreOrder Product",
      },
      id_pre_order_product: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "pre_order_product",
          key: "id",
        },
        comment: "Foreign key to pre_order_product table",
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
      tableName: "pre_order_product_table",
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
  PreOrderProductTable.associate = (models) => {
    // PreOrderProductTable belongs to PreOrder Category
    PreOrderProductTable.belongsTo(models.PreOrderProduct, {
      foreignKey: "id_pre_order_product",
      as: "pre_order_product",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderProductTable has many PreOrder Product field
    PreOrderProductTable.hasMany(models.PreOrderProductField, {
      foreignKey: "id_pre_order_product_table",
      as: "fields",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return PreOrderProductTable;
};
