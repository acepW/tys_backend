const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Division = sequelize.define(
    "Division",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Division",
      },
      division_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Division division name",
      },
      division_code: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Division code",
      },
      id_department: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "departments", key: "id" },
        comment: "Department the division belongs to",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Division (active/inactive)",
      },
    },
    {
      tableName: "divisions",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_division_name",
          fields: ["division_name"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
        {
          name: "idx_division_department",
          fields: ["id_department"],
        },
      ],
    }
  );

  // Define associations (untuk future development)
  Division.associate = (models) => {
    // Contoh: Division dapat memiliki relasi dengan Order, dll
    // Division.hasMany(models.Order, { ... });

    Division.belongsTo(models.Department, {
      foreignKey: "id_department",
      as: "department",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    Division.hasMany(models.Position, {
      foreignKey: "id_division",
      as: "positions",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Division has many Service Pricing
    Division.hasMany(models.ServicePricing, {
      foreignKey: "id_division",
      as: "service_pricing",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    //Division has many Users
    Division.hasMany(models.User, {
      foreignKey: "id_division",
      as: "users",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return Division;
};
