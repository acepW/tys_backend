const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ContractProjectPlanCost = sequelize.define(
    "ContractProjectPlanCost",
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
      tableName: "contract_project_plan_cost",
      timestamps: true,
      underscored: true,
      indexes: [
        // Prefix index untuk string panjang
        {
          name: "idx_id_contract_project_plan",
          fields: ["id_contract_project_plan"],
        },
        {
          name: "idx_id_vendor",
          fields: ["id_vendor"],
        },
        // Composite index (lebih efisien dari is_active standalone)
        {
          name: "idx_contract_project_plan_cost_active",
          fields: ["id_contract_project_plan", "is_active"],
        },
      ],
    }
  );

  // Define associations (untuk future development)
  ContractProjectPlanCost.associate = (models) => {
    // Contoh: ContractProjectPlanCost dapat memiliki relasi dengan Order, dll
    // ContractProjectPlanCost.hasMany(models.Order, { ... });

    // ContractProjectPlanCost belongs to ContractProjectPlan
    ContractProjectPlanCost.belongsTo(models.ContractProjectPlan, {
      foreignKey: "id_contract_project_plan",
      as: "contract_project_plan",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    // ContractProjectPlanCost belongs to User
    ContractProjectPlanCost.belongsTo(models.User, {
      foreignKey: "id_user",
      as: "user",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // ContractProjectPlanCost belongs to vendor
    ContractProjectPlanCost.belongsTo(models.Vendor, {
      foreignKey: "id_vendor",
      as: "vendor",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // ContractProjectPlanCost has many Payment Requests
    ContractProjectPlanCost.hasMany(models.PaymentRequest, {
      foreignKey: "id_contract_project_plan_cost",
      as: "payment_requests",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ContractProjectPlanCost;
};
