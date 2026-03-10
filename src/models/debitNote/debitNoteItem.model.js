const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const DebitNoteItem = sequelize.define(
    "DebitNoteItem",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Debit Note Item",
      },
      id_debit_note: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "debit_notes",
          key: "id",
        },
        comment: "Foreign key to debit notes table",
      },
      product_name_indo: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Product name in Indonesian",
      },
      product_name_mandarin: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Product name in Mandarin",
      },
      price_idr: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "Price in IDR",
      },
      price_rmb: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "Price in RMB",
      },
      qty: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "Qty of service",
      },
      total_price_idr: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "Total price in IDR",
      },
      total_price_rmb: {
        allowNull: false,
        type: DataTypes.FLOAT,
        comment: "Total Price in RMB",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Debit Note Item (active/inactive)",
      },
    },
    {
      tableName: "debit_note_items",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_debit_note",
          fields: ["id_debit_note"],
        },
      ],
    },
  );

  // Define associations
  DebitNoteItem.associate = (models) => {
    // DebitNoteItem belongs to Debit Note
    DebitNoteItem.belongsTo(models.DebitNote, {
      foreignKey: "id_debit_note",
      as: "debit_note",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return DebitNoteItem;
};
