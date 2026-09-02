const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const QuotationGovernmentCost = sequelize.define(
    "QuotationGovernmentCost",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for QuotationGovernmentCost",
      },
      id_quotation_service: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "quotation_service",
          key: "id",
        },
        comment: "Foreign key for Quotation Service",
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
      tableName: "quotation_government_cost",
      timestamps: true,
      underscored: true,
      indexes: [
        // Prefix index untuk string panjang
        {
          name: "idx_id_quotation_service",
          fields: ["id_quotation_service"],
        },
        // Composite index (lebih efisien dari is_active standalone)
        {
          name: "idx_quotation_service_active",
          fields: ["id_quotation_service", "is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  QuotationGovernmentCost.associate = (models) => {
    // Contoh: QuotationGovernmentCost dapat memiliki relasi dengan Order, dll
    // QuotationGovernmentCost.hasMany(models.Order, { ... });

    // QuotationGovernmentCost belongs to Service Pricing
    QuotationGovernmentCost.belongsTo(models.QuotationService, {
      foreignKey: "id_quotation_service",
      as: "quotation_service",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // QuotationGovernmentCost has many QuotationGovernmentCostTables
    QuotationGovernmentCost.hasMany(models.QuotationGovernmentCostTable, {
      foreignKey: "id_quotation_government_cost",
      as: "tables",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return QuotationGovernmentCost;
};
