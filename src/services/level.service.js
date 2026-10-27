const { Op } = require("sequelize");
const DualDatabaseService = require("./dualDatabase.service");

class LevelService extends DualDatabaseService {
  constructor() {
    super("Level");
  }

  /**
   * Check if level name already exists
   * @param {String} levelName
   * @param {Number|null} excludeId
   * @param {Boolean} isDoubleDatabase
   * @returns {Boolean}
   */
  async checkLevelExists(levelName, excludeId = null, isDoubleDatabase = true) {
    const where = { level_name: levelName };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    const existing = await this.findOne({ where }, isDoubleDatabase);
    return existing !== null;
  }
}

module.exports = new LevelService();
