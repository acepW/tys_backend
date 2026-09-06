const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PreOrderGovernmentCostField = sequelize.define(
    "PreOrderGovernmentCostField",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for PreOrder Government Cost Field",
      },
      id_pre_order_government_cost_table: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "pre_order_government_cost_table",
          key: "id",
        },
        comment: "Foreign key for PreOrder Government Cost Table",
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
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Government Cost (active/inactive)",
      },
    },
    {
      tableName: "pre_order_government_cost_field",
      timestamps: true,
      underscored: true,
      indexes: [
        // Prefix index untuk string panjang
        {
          name: "idx_id_pre_order_government_cost_table",
          fields: ["id_pre_order_government_cost_table"],
        },
        // Composite index (lebih efisien dari is_active standalone)
        {
          name: "idx_pre_order_government_cost_field_active",
          fields: ["id_pre_order_government_cost_table", "is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  PreOrderGovernmentCostField.associate = (models) => {
    // Contoh: PreOrderGovernmentCostField dapat memiliki relasi dengan Order, dll
    // PreOrderGovernmentCostField.hasMany(models.Order, { ... });
  };

  return PreOrderGovernmentCostField;
};
