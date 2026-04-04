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
        // Composite index (lebih efisien dari is_active standalone)
        {
          name: "idx_project_plan_cost_active",
          fields: ["id_project_plan", "is_active"],
        },
      ],
    },
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
  };

  return ProjectPlanCost;
};
