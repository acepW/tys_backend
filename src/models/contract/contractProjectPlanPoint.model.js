const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ContractProjectPlanPoint = sequelize.define(
    "ContractProjectPlanPoint",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Project Plan",
      },
      id_contract_project_plan: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "contract_project_plan",
          key: "id",
        },
        comment: "Foreign key for Project Plan",
      },
      id_user: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "Foreign key to users table",
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
      is_checked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "File checked status",
      },
      remarks: {
        type: DataTypes.STRING(1000),
        allowNull: true,
        comment: "File remarks",
      },
      file: {
        type: DataTypes.STRING(1000),
        allowNull: true,
        comment: "File",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Service Pricing (active/inactive)",
      },
    },
    {
      tableName: "contract_project_plan_point",
      timestamps: true,
      underscored: true,
      indexes: [
        // Prefix index untuk string panjang
        {
          name: "idx_id_contract_project_plan",
          fields: ["id_contract_project_plan"],
        },
        // Composite index (lebih efisien dari is_active standalone)
        {
          name: "idx_contract_project_plan_point_active",
          fields: ["id_contract_project_plan", "is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  ContractProjectPlanPoint.associate = (models) => {
    // Contoh: ContractProjectPlanPoint dapat memiliki relasi dengan Order, dll
    // ContractProjectPlanPoint.hasMany(models.Order, { ... });

    // ContractProjectPlanPoint belongs to ContractProjectPlan
    ContractProjectPlanPoint.belongsTo(models.ContractProjectPlan, {
      foreignKey: "id_contract_project_plan",
      as: "contract_project_plan",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    // ContractProjectPlanPoint belongs to User
    ContractProjectPlanPoint.belongsTo(models.User, {
      foreignKey: "id_user",
      as: "user",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ContractProjectPlanPoint;
};
