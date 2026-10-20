const { DataTypes } = require("sequelize");

// Stock opname ticket. Items are counted while pending, reviewed per item while
// request, and the stock is adjusted when the ticket is approved.
module.exports = (sequelize) => {
  const InventoryOpname = sequelize.define(
    "InventoryOpname",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      opname_no: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },
      opname_date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      id_user_opname: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        comment: "User who created and counts the opname",
      },
      note: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM("pending", "request", "approved"),
        allowNull: false,
        defaultValue: "pending",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "inventory_opnames",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["status"] }],
    },
  );
  InventoryOpname.associate = (models) => {
    InventoryOpname.belongsTo(models.User, {
      foreignKey: "id_user_opname",
      as: "user_opname",
    });
    InventoryOpname.hasMany(models.InventoryOpnameItem, {
      foreignKey: "id_inventory_opname",
      as: "items",
    });
    InventoryOpname.hasMany(models.InventoryOpnameVerificationProgress, {
      foreignKey: "id_inventory_opname",
      as: "verification_progress",
    });
  };
  return InventoryOpname;
};
