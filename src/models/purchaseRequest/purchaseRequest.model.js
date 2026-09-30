const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PurchaseRequest = sequelize.define(
    "PurchaseRequest",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      purchase_request_no: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },
      id_user_request: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      id_company: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "companies", key: "id" },
      },
      id_department: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "departments", key: "id" },
      },
      id_division: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "divisions", key: "id" },
      },
      request_date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      purchase_request_category: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(
          "pending",
          "request manager",
          "request ga",
          "approved ga",
          "rejected manager",
          "rejected ga",
        ),
        allowNull: false,
        defaultValue: "pending",
      },
    },
    {
      tableName: "purchase_requests",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["id_company", "created_at"] },
        { fields: ["status"] },
      ],
    },
  );

  PurchaseRequest.associate = (models) => {
    PurchaseRequest.belongsTo(models.User, {
      foreignKey: "id_user_request",
      as: "user_request",
    });
    PurchaseRequest.belongsTo(models.Company, {
      foreignKey: "id_company",
      as: "company",
    });
    PurchaseRequest.belongsTo(models.Department, {
      foreignKey: "id_department",
      as: "department",
    });
    PurchaseRequest.belongsTo(models.Division, {
      foreignKey: "id_division",
      as: "division",
    });
    PurchaseRequest.hasMany(models.PurchaseRequestItem, {
      foreignKey: "id_purchase_request",
      as: "items",
    });
    PurchaseRequest.hasMany(models.PurchaseRequestVerificationProgress, {
      foreignKey: "id_purchase_request",
      as: "verification_progress",
    });
  };
  return PurchaseRequest;
};
