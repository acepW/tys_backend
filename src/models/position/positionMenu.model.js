const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PositionMenu = sequelize.define(
    "PositionMenu",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_position: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "positions", key: "id" },
      },
      id_menu: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "menus", key: "id" },
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Apakah menu ini aktif untuk position ini",
      },
      is_can_view: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      is_can_create: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      is_can_update: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      is_can_delete: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    },
    {
      tableName: "position_menus",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_position_menu_unique",
          unique: true,
          fields: ["id_position", "id_menu"],
        },
        { name: "idx_pm_id_position", fields: ["id_position"] },
        { name: "idx_pm_id_menu", fields: ["id_menu"] },
      ],
    },
  );

  PositionMenu.associate = (models) => {
    PositionMenu.belongsTo(models.Position, {
      foreignKey: "id_position",
      as: "position",
    });
    PositionMenu.belongsTo(models.Menu, {
      foreignKey: "id_menu",
      as: "menu",
    });
  };

  return PositionMenu;
};
