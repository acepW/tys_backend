const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const QuotationGovernmentCostField = sequelize.define(
    "QuotationGovernmentCostField",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Quotation Government Cost Field",
      },
      id_quotation_government_cost_table: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "quotation_government_cost_table",
          key: "id",
        },
        comment: "Foreign key for Quotation Government Cost Table",
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
      tableName: "quotation_government_cost_field",
      timestamps: true,
      underscored: true,
      indexes: [
        // Prefix index untuk string panjang
        {
          name: "idx_id_quotation_government_cost_table",
          fields: ["id_quotation_government_cost_table"],
        },
        // Composite index (lebih efisien dari is_active standalone)
        {
          name: "idx_quotation_government_cost_field_active",
          fields: ["id_quotation_government_cost_table", "is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  QuotationGovernmentCostField.associate = (models) => {
    // Contoh: QuotationGovernmentCostField dapat memiliki relasi dengan Order, dll
    // QuotationGovernmentCostField.hasMany(models.Order, { ... });
  };

  return QuotationGovernmentCostField;
};
