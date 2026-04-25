const DualDatabaseService = require("./../dualDatabase.service");
const positionMenuService = require("../../services/position/positionMenu.service");
const { models } = require("../../models");

class PositionService extends DualDatabaseService {
  constructor() {
    super("Position");
  }

  /**
   * Check if position name already exists
   * @param {String} positionName
   * @param {Number|null} excludeId
   * @param {Boolean} isDoubleDatabase
   * @returns {Boolean}
   */
  async checkPositionExists(
    positionName,
    excludeId = null,
    isDoubleDatabase = true,
  ) {
    const { Op } = require("sequelize");
    const where = { position_name: positionName };

    if (excludeId) {
      where.id = { [Op.ne]: excludeId };
    }

    const existing = await this.findOne({ where }, isDoubleDatabase);
    return existing !== null;
  }

  /**
   * Get position by ID with all menus + permissions
   */
  async getByIdWithMenus(id, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const position = await dbModels.Position.findByPk(id);

    if (!position) return null;

    const menuAccess = await positionMenuService.getByPosition(
      id,
      isDoubleDatabase,
    );

    return {
      ...position.toJSON(),
      menu_access: menuAccess,
    };
  }
}

module.exports = new PositionService();
