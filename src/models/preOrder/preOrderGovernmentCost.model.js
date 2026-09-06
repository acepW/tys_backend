const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PreOrderGovernmentCost = sequelize.define(
    "PreOrderGovernmentCost",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for PreOrderGovernmentCost",
      },
      id_pre_order_service: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "pre_order_service",
          key: "id",
        },
        comment: "Foreign key for PreOrder Service",
      },
      title_indo: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Title in Indonesian",
      },
      title_mandarin: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Title in Mandarin",
      },
      price_idr: {
        allowNull: false,
        type: DataTypes.DECIMAL(15, 0),
        comment: "Price in IDR",
      },
      price_rmb: {
        allowNull: false,
        type: DataTypes.DECIMAL(15, 0),
        comment: "Price in RMB",
      },
      total_price_idr: {
        allowNull: false,
        type: DataTypes.DECIMAL(15, 0),
        comment: "Total price in IDR",
      },
      total_price_rmb: {
        allowNull: false,
        type: DataTypes.DECIMAL(15, 0),
        comment: "Total price in RMB",
      },
      qty: {
        allowNull: false,
        type: DataTypes.DECIMAL(15, 0),
        comment: "Quantity",
      },
      qty_total: {
        allowNull: false,
        type: DataTypes.DECIMAL(15, 0),
        comment: "Total quantity",
      },
      index: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "index for ordering the products in the quotation category",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Government Cost (active/inactive)",
      },
    },
    {
      tableName: "pre_order_government_cost",
      timestamps: true,
      underscored: true,
      indexes: [
        // Prefix index untuk string panjang
        {
          name: "idx_id_pre_order_service",
          fields: ["id_pre_order_service"],
        },
        // Composite index (lebih efisien dari is_active standalone)
        {
          name: "idx_pre_order_service_active",
          fields: ["id_pre_order_service", "is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  PreOrderGovernmentCost.associate = (models) => {
    // Contoh: PreOrderGovernmentCost dapat memiliki relasi dengan Order, dll
    // PreOrderGovernmentCost.hasMany(models.Order, { ... });

    // PreOrderGovernmentCost belongs to Service Pricing
    PreOrderGovernmentCost.belongsTo(models.PreOrderService, {
      foreignKey: "id_pre_order_service",
      as: "pre_order_service",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderGovernmentCost has many PreOrderGovernmentCostTables
    PreOrderGovernmentCost.hasMany(models.PreOrderGovernmentCostTable, {
      foreignKey: "id_pre_order_government_cost",
      as: "tables",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return PreOrderGovernmentCost;
};
