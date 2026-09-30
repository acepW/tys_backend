const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PaymentRequestExpense = sequelize.define("PaymentRequestExpense", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    id_payment_request: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "payment_requests", key: "id" },
    },
    purchase_date: { type: DataTypes.DATE, allowNull: false },
    category: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.STRING(1000), allowNull: false },
    vendor: { type: DataTypes.STRING(500), allowNull: false },
    total: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  }, {
    tableName: "payment_request_expenses",
    timestamps: true,
    underscored: true,
    indexes: [{ name: "idx_payment_request_expense_parent", fields: ["id_payment_request"] }],
  });

  PaymentRequestExpense.associate = (models) => {
    PaymentRequestExpense.belongsTo(models.PaymentRequest, {
      foreignKey: "id_payment_request",
      as: "payment_request",
    });
    PaymentRequestExpense.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: "payment_request_expenses", category: "files" },
      as: "files",
    });
  };

  return PaymentRequestExpense;
};
