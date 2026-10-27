const { DataTypes } = require("sequelize");

// One purchase realization per save on a GA purchase order item. Rows are never
// overwritten, so a later realization (e.g. after a refund) keeps the earlier ones.
module.exports = (sequelize) => {
  const GaPurchaseOrderItemRealization = sequelize.define(
    "GaPurchaseOrderItemRealization",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_ga_purchase_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "ga_purchase_orders", key: "id" },
      },
      id_ga_purchase_order_item: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "ga_purchase_order_items", key: "id" },
      },
      id_user: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      purchase_realization_date: { type: DataTypes.DATE, allowNull: false },
      purchase_realization_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
      },
      note: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "ga_purchase_order_item_realizations",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["id_ga_purchase_order"] },
        { fields: ["id_ga_purchase_order_item"] },
      ],
    },
  );
  GaPurchaseOrderItemRealization.associate = (models) => {
    GaPurchaseOrderItemRealization.belongsTo(models.GaPurchaseOrder, {
      foreignKey: "id_ga_purchase_order",
      as: "ga_purchase_order",
    });
    GaPurchaseOrderItemRealization.belongsTo(models.GaPurchaseOrderItem, {
      foreignKey: "id_ga_purchase_order_item",
      as: "ga_purchase_order_item",
    });
    GaPurchaseOrderItemRealization.belongsTo(models.User, {
      foreignKey: "id_user",
      as: "user",
    });
    for (const category of ["files_purchase_proof", "files_invoice"]) {
      GaPurchaseOrderItemRealization.hasMany(models.File, {
        foreignKey: "fileable_id",
        constraints: false,
        scope: { fileable_type: "ga_purchase_order_item_realizations", category },
        as: category,
      });
    }
  };
  return GaPurchaseOrderItemRealization;
};
