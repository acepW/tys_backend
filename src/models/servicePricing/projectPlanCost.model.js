const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProjectPlanCost = sequelize.define(
    "ProjectPlanCost",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Project Plan",
      },
      id_project_plan: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "project_plan",
          key: "id",
        },
        comment: "Foreign key for Project Plan",
      },
      id_vendor: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "vendors",
          key: "id",
        },
        comment: "Foreign key for vendors",
      },
      vendor_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Vendor name",
      },
      payment_type: {
        type: DataTypes.ENUM("vendor", "pnbp spb", "others"),
        allowNull: false,
        comment: "Payment type",
      },
      cost_bearer: {
        type: DataTypes.ENUM("company", "customer"),
        allowNull: true,
        comment: "cost bearer payment",
      },
      cost_description_indo: {
        type: DataTypes.STRING(1000),
        allowNull: false,
        comment: "Cost description in Indonesian",
      },
      cost_description_mandarin: {
        type: DataTypes.STRING(1000),
        allowNull: false,
        comment: "Cost description in Mandarin",
      },
      price_idr: {
        type: DataTypes.DECIMAL(10, 0),
        allowNull: false,
        comment: "Price in IDR",
      },
      price_rmb: {
        type: DataTypes.DECIMAL(10, 0),
        allowNull: false,
        comment: "Price in RMB",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Service Pricing (active/inactive)",
      },
    },
    {
      tableName: "project_plan_cost",
      timestamps: true,
      underscored: true,
      indexes: [
        // Prefix index untuk string panjang
        {
          name: "idx_id_project_plan",
          fields: ["id_project_plan"],
        },
        {
          name: "idx_id_vendor",
          fields: ["id_vendor"],
        },
        // Composite index (lebih efisien dari is_active standalone)
        {
          name: "idx_project_plan_cost_active",
          fields: ["id_project_plan", "is_active"],
        },
      ],
    }
  );

  // Define associations (untuk future development)
  ProjectPlanCost.associate = (models) => {
    // Contoh: ProjectPlanCost dapat memiliki relasi dengan Order, dll
    // ProjectPlanCost.hasMany(models.Order, { ... });

    // Service Pricing belongs to Category
    ProjectPlanCost.belongsTo(models.ProjectPlan, {
      foreignKey: "id_project_plan",
      as: "project_plan",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // Service Pricing belongs to vendor
    ProjectPlanCost.belongsTo(models.Vendor, {
      foreignKey: "id_vendor",
      as: "vendor",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ProjectPlanCost;
};
