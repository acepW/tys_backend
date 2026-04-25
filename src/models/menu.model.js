const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Menu = sequelize.define(
    "Menu",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      label: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      icon: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Icon name string, e.g. HomeIcon — frontend mapping sendiri",
      },
      path: {
        type: DataTypes.STRING(300),
        allowNull: true,
        comment: "Direct path jika tidak punya sub-items",
      },
      parent_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "menus", key: "id" },
        comment: "Null = parent menu, diisi = sub-item",
      },
      order_index: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "Urutan tampil di sidebar",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "menus",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "idx_menu_parent_id", fields: ["parent_id"] },
        { name: "idx_menu_is_active", fields: ["is_active"] },
      ],
    },
  );

  Menu.associate = (models) => {
    // Self-referencing: parent punya banyak sub-items
    Menu.hasMany(models.Menu, {
      foreignKey: "parent_id",
      as: "sub_items",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    Menu.belongsTo(models.Menu, {
      foreignKey: "parent_id",
      as: "parent",
    });

    Menu.hasMany(models.PositionMenu, {
      foreignKey: "id_menu",
      as: "position_menus",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return Menu;
};
