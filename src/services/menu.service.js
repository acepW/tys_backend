const DualDatabaseService = require("./dualDatabase.service");
const { models } = require("../models");
const seedMenus = require("../seeders/menu.seeder");

class MenuService extends DualDatabaseService {
  constructor() {
    super("Menu");
  }

  async getAllMenus(isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    return await dbModels.Menu.findAll({
      where: { parent_id: null, is_active: true },
      include: [
        {
          model: dbModels.Menu,
          as: "sub_items",
          where: { is_active: true },
          required: false,
        },
      ],
      order: [
        ["order_index", "ASC"],
        [{ model: dbModels.Menu, as: "sub_items" }, "order_index", "ASC"],
      ],
    });
  }

  async getMenuById(id, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    return await dbModels.Menu.findByPk(id, {
      include: [
        {
          model: dbModels.Menu,
          as: "sub_items",
          required: false,
        },
      ],
    });
  }

  // Tidak perlu sync lagi — cukup create menu saja
  async createMenu(data, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;
    return await dbModels.Menu.create(data);
  }

  async updateMenu(id, data, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const menu = await dbModels.Menu.findByPk(id);
    if (!menu) return null;

    await menu.update(data);
    return menu;
  }

  async deleteMenu(id, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const menu = await dbModels.Menu.findByPk(id);
    if (!menu) return null;

    if (!menu.parent_id) {
      await dbModels.Menu.update(
        { is_active: false },
        { where: { parent_id: id } },
      );
    }

    await menu.update({ is_active: false });
    return menu;
  }

  async checkLabelExists(
    label,
    parentId = null,
    excludeId = null,
    isDoubleDatabase = true,
  ) {
    const { Op } = require("sequelize");
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const where = { label, parent_id: parentId ?? null };
    if (excludeId) where.id = { [Op.ne]: excludeId };

    const existing = await dbModels.Menu.findOne({ where });
    return existing !== null;
  }

  async runSeeder(isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;
    return await seedMenus(dbModels);
  }
}

module.exports = new MenuService();
