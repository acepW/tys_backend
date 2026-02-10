const DualDatabaseService = require("./dualDatabase.service");

class DivisionService extends DualDatabaseService {
  constructor() {
    super("Division");
  }

  /**
   * Check if email already exists
   * @param {String} email
   * @param {Number|null} excludeId
   * @param {Boolean} isDoubleDatabase
   * @returns {Boolean}
   */
  async checkDivisionExists(
    divisionName,
    excludeId = null,
    isDoubleDatabase = true,
  ) {
    const { Op } = require("sequelize");
    const where = { division_name: divisionName };

    if (excludeId) {
      where.id = { [Op.ne]: excludeId };
    }

    const existing = await this.findOne({ where }, isDoubleDatabase);
    return existing !== null;
  }
}

module.exports = new DivisionService();
