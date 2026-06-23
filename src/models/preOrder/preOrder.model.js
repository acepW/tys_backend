const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PreOrder = sequelize.define(
    "PreOrder",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for PreOrder",
      },
      id_company: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "companies",
          key: "id",
        },
        comment: "Foreign key to companies table",
      },
      id_customer: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "customers",
          key: "id",
        },
        comment: "Foreign key to companies table",
      },
      id_quotation: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "quotations",
          key: "id",
        },
        comment: "Foreign key to quotations table",
      },
      id_contract: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "contracts",
          key: "id",
        },
        comment: "Foreign key to contracts table",
      },

      date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: "Date of PreOrder",
      },
      pre_order_no: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "No of PreOrder",
      },
      pre_order_title_indo: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "PreOrder title for Indonesian",
      },
      pre_order_title_mandarin: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "PreOrder title for Mandarin",
      },
      status: {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "pending",
        comment: "Status of PreOrder",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of PreOrder (active/inactive)",
      },
    },
    {
      tableName: "pre_orders",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_company",
          fields: ["id_company"],
        },
        {
          name: "idx_id_customer",
          fields: ["id_customer"],
        },
        {
          name: "idx_pre_order_no",
          fields: ["pre_order_no"],
        },
        {
          name: "idx_pre_order_title_indo",
          fields: [{ name: "pre_order_title_indo", length: 100 }],
        },
        // Composite index
        {
          name: "idx_company_active",
          fields: ["id_company", "is_active"],
        },
      ],
    },
  );

  // Define associations
  PreOrder.associate = (models) => {
    // PreOrder belongs to Company
    PreOrder.belongsTo(models.Company, {
      foreignKey: "id_company",
      as: "company",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrder belongs to Customer
    PreOrder.belongsTo(models.Customer, {
      foreignKey: "id_customer",
      as: "customer",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrder belongs to Quotation
    PreOrder.belongsTo(models.Quotation, {
      foreignKey: "id_quotation",
      as: "quotation",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    // PreOrder belongs to Contract
    PreOrder.belongsTo(models.Contract, {
      foreignKey: "id_contract",
      as: "contract",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrder has many PreOrder category
    PreOrder.hasMany(models.PreOrderCategory, {
      foreignKey: "id_pre_order",
      as: "pre_order_category",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    // PreOrder has many PreOrder Verification Progress
    PreOrder.hasMany(models.PreOrderVerificationProgress, {
      foreignKey: "id_pre_order",
      as: "verification_progress",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });

    // PreOrder has many PreOrder payment
    PreOrder.hasMany(models.PreOrderPayment, {
      foreignKey: "id_pre_order",
      as: "pre_order_payment",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return PreOrder;
};
