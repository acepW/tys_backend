const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ContractVerificationProgress = sequelize.define(
    "ContractVerificationProgress",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Contract Verification Progress",
      },
      id_contract: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "contracts",
          key: "id",
        },
        comment: "Foreign key to contracts table",
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
      status: {
        type: DataTypes.ENUM(""),
        allowNull: false,
        comment: "Description is BAB for Indonesian",
      },
      note: {
        type: DataTypes.TEXT("long"),
        allowNull: true,
        comment: "Description is BAB for Mandarin",
      },
      status: {
        type: DataTypes.ENUM(
          "created",
          "submited",
          "on verification",
          "rejected",
          "approved",
          "sending to customer",
          "approve by customer",
          "reject by customer",
        ),
        allowNull: false,
        comment: "Status of Contract Progress",
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of ContractVerificationProgress (active/inactive)",
      },
    },
    {
      tableName: "contract_verification_progress",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_contract",
          fields: ["id_contract"],
        },
        {
          name: "idx_id_user",
          fields: ["id_user"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  ContractVerificationProgress.associate = (models) => {
    // Contoh: ContractVerificationProgress dapat memiliki relasi dengan Order, dll
    // ContractVerificationProgress.hasMany(models.Order, { ... });

    //Contract Verification Progress belongs to Contract
    ContractVerificationProgress.belongsTo(models.Contract, {
      foreignKey: "id_contract",
      as: "contract",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Contract Verification Progress belongs to User
    ContractVerificationProgress.belongsTo(models.User, {
      foreignKey: "id_user",
      as: "user",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return ContractVerificationProgress;
};
