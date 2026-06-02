const DualDatabaseService = require("./dualDatabase.service");

class ServiceCodeService extends DualDatabaseService {
  constructor() {
    super("ServiceCode");
  }

  /**
   * Check if serviceCode already exists
   * @param {String} serviceCode
   * @param {Number|null} excludeId
   * @param {Boolean} isDoubleDatabase
   * @returns {Boolean}
   */
  async checkServiceCodeExists(
    serviceCode,
    excludeId = null,
    isDoubleDatabase = true,
  ) {
    const { Op } = require("sequelize");
    const where = { service_code: serviceCode };

    if (excludeId) {
      where.id = { [Op.ne]: excludeId };
    }

    const existing = await this.findOne({ where }, isDoubleDatabase);
    return existing !== null;
  }
}

module.exports = new ServiceCodeService();
