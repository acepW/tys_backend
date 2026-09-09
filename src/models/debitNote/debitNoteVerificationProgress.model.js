const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const DebitNoteVerificationProgress = sequelize.define(
    "DebitNoteVerificationProgress",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Debit Note Verification Progress",
      },
      id_debit_note: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "debit_notes",
          key: "id",
        },
        comment: "Foreign key to debit_notes table",
      },
      id_user: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "User who performed the action",
      },
      note: {
        type: DataTypes.TEXT("long"),
        allowNull: true,
        comment: "Verification progress description",
      },
      status: {
        type: DataTypes.ENUM(
          "created",
          "submitted",
          "on verification",
          "rejected",
          "approved",
          "paid",
        ),
        allowNull: false,
        comment: "Status of Debit Note Progress",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "debit_note_verification_progress",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "idx_dn_progress_debit_note", fields: ["id_debit_note"] },
        { name: "idx_dn_progress_user", fields: ["id_user"] },
      ],
    },
  );

  DebitNoteVerificationProgress.associate = (models) => {
    DebitNoteVerificationProgress.belongsTo(models.DebitNote, {
      foreignKey: "id_debit_note",
      as: "debit_note",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    DebitNoteVerificationProgress.belongsTo(models.User, {
      foreignKey: "id_user",
      as: "user",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return DebitNoteVerificationProgress;
};
