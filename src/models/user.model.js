const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Users = sequelize.define(
    "Users",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Users",
      },
      id_division: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "divisions",
          key: "id",
        },
        comment: "Id division from divisions",
      },
      email: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
        comment: "Users name",
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Users name",
      },
      password: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Users password",
      },
      role: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Users role",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Users (active/inactive)",
      },
    },
    {
      tableName: "users",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_division",
          fields: ["id_division"],
        },
        {
          name: "idx_email",
          fields: ["email"],
        },
        {
          name: "idx_role",
          fields: ["role"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    },
  );

  // Define associations (untuk future development)
  Users.associate = (models) => {
    // Contoh: Users dapat memiliki relasi dengan Order, dll
    // Users.hasMany(models.Order, { ... });

    //Users belongs to Division
    Users.belongsTo(models.Division, {
      foreignKey: "id_division",
      as: "division",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Service Pricing
    Users.hasMany(models.ServicePricing, {
      foreignKey: "id_user_create",
      as: "created_service_pricing",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Service Pricing
    Users.hasMany(models.ServicePricing, {
      foreignKey: "id_user_approve",
      as: "approved_service_pricing",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Service Pricing
    Users.hasMany(models.ServicePricing, {
      foreignKey: "id_user_reject",
      as: "rejected_service_pricing",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Quotation
    Users.hasMany(models.Quotation, {
      foreignKey: "id_user_create",
      as: "created_quotation",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Quotation
    Users.hasMany(models.Quotation, {
      foreignKey: "id_user_approve",
      as: "approved_quotation",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Quotation
    Users.hasMany(models.Quotation, {
      foreignKey: "id_user_reject",
      as: "rejected_quotation",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Users has many Contract Verification Progress
    Users.hasMany(models.ContractVerificationProgress, {
      foreignKey: "id_user",
      as: "verification_progress",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Users;
};
