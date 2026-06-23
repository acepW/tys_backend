const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PreOrderVerificationProgress = sequelize.define(
    "PreOrderVerificationProgress",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for PreOrder Verification Progress",
      },
      id_pre_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "pre_orders",
          key: "id",
        },
        comment: "Foreign key to pre_orders table",
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
      note: {
        type: DataTypes.TEXT("long"),
        allowNull: true,
        comment: "Description is BAB for Mandarin",
      },
      status: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Status of Quotation Progress",
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of PreOrderVerificationProgress (active/inactive)",
      },
    },
    {
      tableName: "pre_order_verification_progress",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_pre_order",
          fields: ["id_pre_order"],
        },
        {
          name: "idx_id_user",
          fields: ["id_user"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  PreOrderVerificationProgress.associate = (models) => {
    // Contoh: PreOrderVerificationProgress dapat memiliki relasi dengan Order, dll
    // PreOrderVerificationProgress.hasMany(models.Order, { ... });

    //PreOrder Verification Progress belongs to PreOrder
    PreOrderVerificationProgress.belongsTo(models.PreOrder, {
      foreignKey: "id_pre_order",
      as: "pre_order",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //PreOrder Verification Progress belongs to User
    PreOrderVerificationProgress.belongsTo(models.User, {
      foreignKey: "id_user",
      as: "user",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return PreOrderVerificationProgress;
};
