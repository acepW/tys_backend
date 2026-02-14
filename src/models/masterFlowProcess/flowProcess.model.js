const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const FlowProcess = sequelize.define(
    "FlowProcess",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for Flow Process",
      },
      id_category: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "categories",
          key: "id",
        },
        comment: "Id category from category",
      },
      project_name_indo: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Project name in Indonesian",
      },
      project_name_mandarin: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "Project name in Mandarin",
      },
      document_description: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
        comment: "Product name in Mandarin",
      },
      process: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "Process for list of process in flow",
        get() {
          const raw = this.getDataValue("process");
          try {
            return JSON.parse(raw);
          } catch {
            return raw;
          }
        },
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status of Service Pricing (active/inactive)",
      },
    },
    {
      tableName: "flow_processes",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_id_category",
          fields: ["id_category"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    }
  );

  // Define associations (untuk future development)
  FlowProcess.associate = (models) => {
    // Contoh: FlowProcess dapat memiliki relasi dengan Order, dll
    // FlowProcess.hasMany(models.Order, { ... });

    // Service Pricing belongs to Category
    FlowProcess.belongsTo(models.Category, {
      foreignKey: "id_category",
      as: "category",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  };

  return FlowProcess;
};
