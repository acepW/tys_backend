const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProjectPlanPoint = sequelize.define(
    "ProjectPlanPoint",
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

      file_description_indo: {
        type: DataTypes.STRING(1000),
        allowNull: false,
        comment: "File description in Indonesian",
      },
      file_description_mandarin: {
        type: DataTypes.STRING(1000),
        allowNull: false,
        comment: "File description in Mandarin",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Service Pricing (active/inactive)",
      },
    },
    {
      tableName: "project_plan_point",
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
          name: "idx_project_plan_point_active",
          fields: ["id_project_plan", "is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  ProjectPlanPoint.associate = (models) => {
    // Contoh: ProjectPlanPoint dapat memiliki relasi dengan Order, dll
    // ProjectPlanPoint.hasMany(models.Order, { ... });

    // Service Pricing belongs to Category
    ProjectPlanPoint.belongsTo(models.ProjectPlan, {
      foreignKey: "id_project_plan",
      as: "project_plan",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ProjectPlanPoint;
};
