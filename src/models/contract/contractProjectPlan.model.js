const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ContractProjectPlan = sequelize.define(
    "ContractProjectPlan",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Contract  Project Plan",
      },
      id_contract_service: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "contract_service",
          key: "id",
        },
        comment: "Foreign key for Contract Service",
      },
      id_user_started: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "Foreign key to users table",
      },
      id_user_stopped: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "Foreign key to users table",
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
      plan_start_date: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: "Plan Start Date",
      },
      plan_end_date: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: "Plan End Date",
      },
      plan_duration: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Plan Duration",
      },
      realization_start_date: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Realization Start Date",
      },
      realization_end_date: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Realization End Date",
      },
      realization_duration: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Realization Duration",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Contract Service (active/inactive)",
      },
    },
    {
      tableName: "contract_project_plan",
      timestamps: true,
      underscored: true,
      indexes: [
        // Prefix index untuk string panjang
        {
          name: "idx_id_contract_service",
          fields: ["id_contract_service"],
        },
        // Composite index (lebih efisien dari is_active standalone)
        {
          name: "idx_contract_service_active",
          fields: ["id_contract_service", "is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  ContractProjectPlan.associate = (models) => {
    // Contoh: ContractProjectPlan dapat memiliki relasi dengan Order, dll
    // ContractProjectPlan.hasMany(models.Order, { ... });

    // ContractProjectPlan belongs to Contract Service
    ContractProjectPlan.belongsTo(models.ContractService, {
      foreignKey: "id_contract_service",
      as: "contract_service",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // ContractProjectPlan has many ContractProjectPlanPoints
    ContractProjectPlan.hasMany(models.ContractProjectPlanPoint, {
      foreignKey: "id_contract_project_plan",
      as: "contract_project_plan_points",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // ContractProjectPlan belongs to User (started)
    ContractProjectPlan.belongsTo(models.User, {
      foreignKey: "id_user_started",
      as: "user_started",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // ContractProjectPlan belongs to User (stopped)
    ContractProjectPlan.belongsTo(models.User, {
      foreignKey: "id_user_stopped",
      as: "user_stopped",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ContractProjectPlan;
};
