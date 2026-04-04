const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProjectPlan = sequelize.define(
    "ProjectPlan",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Project Plan",
      },
      id_service_pricing: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "service_pricing",
          key: "id",
        },
        comment: "Foreign key for Service Pricing",
      },

      activity_name_indo: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Activity name in Indonesian",
      },
      activity_name_mandarin: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Activity name in Mandarin",
      },
      duration: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Duration",
      },
      category: {
        type: DataTypes.ENUM("normal", "cost"),
        defaultValue: "normal",
        comment: "category activity",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Service Pricing (active/inactive)",
      },
    },
    {
      tableName: "project_plan",
      timestamps: true,
      underscored: true,
      indexes: [
        // Prefix index untuk string panjang
        {
          name: "idx_id_service_pricing",
          fields: ["id_service_pricing"],
        },
        // Composite index (lebih efisien dari is_active standalone)
        {
          name: "idx_service_pricing_active",
          fields: ["id_service_pricing", "is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  ProjectPlan.associate = (models) => {
    // Contoh: ProjectPlan dapat memiliki relasi dengan Order, dll
    // ProjectPlan.hasMany(models.Order, { ... });

    // ProjectPlan belongs to Service Pricing
    ProjectPlan.belongsTo(models.ServicePricing, {
      foreignKey: "id_service_pricing",
      as: "service_pricing",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // ProjectPlan has many ProjectPlanPoints
    ProjectPlan.hasMany(models.ProjectPlanPoint, {
      foreignKey: "id_project_plan",
      as: "project_plan_points",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // ProjectPlan has many ProjectPlanCosts
    ProjectPlan.hasMany(models.ProjectPlanCost, {
      foreignKey: "id_project_plan",
      as: "project_plan_costs",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ProjectPlan;
};
