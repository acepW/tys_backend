const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PreOrderGovernmentCostTable = sequelize.define(
    "PreOrderGovernmentCostTable",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for PreOrderGovernmentCostTable",
      },
      id_pre_order_government_cost: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "pre_order_government_cost",
          key: "id",
        },
        comment: "Foreign key for PreOrder Government Cost",
      },
      index: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "index for ordering the products in the pre_order category",
      },
      is_selected: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "selected or not for the table in the pre_order",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Government Cost (active/inactive)",
      },
    },
    {
      tableName: "pre_order_government_cost_table",
      timestamps: true,
      underscored: true,
      indexes: [
        // Prefix index untuk string panjang
        {
          name: "idx_id_pre_order_government_cost",
          fields: ["id_pre_order_government_cost"],
        },
        // Composite index (lebih efisien dari is_active standalone)
        {
          name: "idx_pre_order_government_cost_active",
          fields: ["id_pre_order_government_cost", "is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  PreOrderGovernmentCostTable.associate = (models) => {
    // Contoh: PreOrderGovernmentCostTable dapat memiliki relasi dengan Order, dll
    // PreOrderGovernmentCostTable.hasMany(models.Order, { ... });

    // PreOrderGovernmentCostTable belongs to PreOrder Government Cost
    PreOrderGovernmentCostTable.belongsTo(models.PreOrderGovernmentCost, {
      foreignKey: "id_pre_order_government_cost",
      as: "pre_order_government_cost",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrderGovernmentCostTable has many PreOrderGovernmentCostTableFields
    PreOrderGovernmentCostTable.hasMany(models.PreOrderGovernmentCostField, {
      foreignKey: "id_pre_order_government_cost_table",
      as: "fields",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return PreOrderGovernmentCostTable;
};
