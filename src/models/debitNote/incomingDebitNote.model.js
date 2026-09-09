const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const IncomingDebitNote = sequelize.define(
    "IncomingDebitNote",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      source_type: {
        type: DataTypes.ENUM("contract", "pre_order"),
        allowNull: false,
      },
      id_contract_payment: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "contract_payment", key: "id" },
      },
      id_contract_payment_list: {
        type: DataTypes.INTEGER,
        allowNull: true,
        unique: true,
        references: { model: "contract_payment_list", key: "id" },
      },
      id_pre_order_payment: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "pre_order_payment", key: "id" },
      },
      id_pre_order_payment_list: {
        type: DataTypes.INTEGER,
        allowNull: true,
        unique: true,
        references: { model: "pre_order_payment_list", key: "id" },
      },
      id_debit_note: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "debit_notes", key: "id" },
      },
      status: {
        type: DataTypes.ENUM("incoming", "history"),
        allowNull: false,
        defaultValue: "incoming",
      },
      consumed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      id_user_create: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "incoming_debit_notes",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "idx_incoming_debit_note_status", fields: ["status"] },
        { name: "idx_incoming_debit_note_source", fields: ["source_type"] },
        { name: "idx_incoming_debit_note_document", fields: ["id_debit_note"] },
      ],
      validate: {
        exactlyOneSource() {
          const hasContractSource =
            this.id_contract_payment != null &&
            this.id_contract_payment_list != null;
          const hasPreOrderSource =
            this.id_pre_order_payment != null &&
            this.id_pre_order_payment_list != null;

          if (hasContractSource === hasPreOrderSource) {
            throw new Error(
              "Incoming debit note must have exactly one Contract or PreOrder source",
            );
          }
        },
      },
    },
  );

  IncomingDebitNote.associate = (models) => {
    IncomingDebitNote.belongsTo(models.ContractPayment, {
      foreignKey: "id_contract_payment",
      as: "contract_payment",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    IncomingDebitNote.belongsTo(models.ContractPaymentList, {
      foreignKey: "id_contract_payment_list",
      as: "contract_payment_list",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    IncomingDebitNote.belongsTo(models.PreOrderPayment, {
      foreignKey: "id_pre_order_payment",
      as: "pre_order_payment",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    IncomingDebitNote.belongsTo(models.PreOrderPaymentList, {
      foreignKey: "id_pre_order_payment_list",
      as: "pre_order_payment_list",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    IncomingDebitNote.belongsTo(models.DebitNote, {
      foreignKey: "id_debit_note",
      as: "debit_note",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    IncomingDebitNote.belongsTo(models.User, {
      foreignKey: "id_user_create",
      as: "user_create",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return IncomingDebitNote;
};
