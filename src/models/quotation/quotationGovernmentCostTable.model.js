const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const QuotationGovernmentCostTable = sequelize.define(
    "QuotationGovernmentCostTable",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for QuotationGovernmentCostTable",
      },
      id_quotation_government_cost: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "quotation_government_cost",
          key: "id",
        },
        comment: "Foreign key for Quotation Government Cost",
      },
      index: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "index for ordering the products in the quotation category",
      },
      is_selected: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "selected or not for the table in the quotation",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Government Cost (active/inactive)",
      },
    },
    {
      tableName: "quotation_government_cost_table",
      timestamps: true,
      underscored: true,
      indexes: [
        // Prefix index untuk string panjang
        {
          name: "idx_id_quotation_government_cost",
          fields: ["id_quotation_government_cost"],
        },
        // Composite index (lebih efisien dari is_active standalone)
        {
          name: "idx_quotation_government_cost_active",
          fields: ["id_quotation_government_cost", "is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  QuotationGovernmentCostTable.associate = (models) => {
    // Contoh: QuotationGovernmentCostTable dapat memiliki relasi dengan Order, dll
    // QuotationGovernmentCostTable.hasMany(models.Order, { ... });

    // QuotationGovernmentCostTable belongs to Quotation Government Cost
    QuotationGovernmentCostTable.belongsTo(models.QuotationGovernmentCost, {
      foreignKey: "id_quotation_government_cost",
      as: "quotation_government_cost",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // QuotationGovernmentCostTable has many QuotationGovernmentCostTableFields
    QuotationGovernmentCostTable.hasMany(models.QuotationGovernmentCostField, {
      foreignKey: "id_quotation_government_cost_table",
      as: "fields",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return QuotationGovernmentCostTable;
};
