const DualDatabaseService = require("./dualDatabase.service");

class CompanyService extends DualDatabaseService {
  constructor() {
    super("Company");
  }

  /**
   * Get active companies
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Active companies
   */
  async getActiveCompanies(isDoubleDatabase = true) {
    const options = {
      where: { is_active: true },
      order: [["company_name", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Search companies by name
   * @param {String} searchTerm
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Matching companies
   */
  async searchByName(searchTerm, isDoubleDatabase = true) {
    const { Op } = require("sequelize");

    const options = {
      where: {
        company_name: {
          [Op.like]: `%${searchTerm}%`,
        },
      },
      order: [["company_name", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Check if email already exists
   * @param {String} email
   * @param {Number|null} excludeId
   * @param {Boolean} isDoubleDatabase
   * @returns {Boolean}
   */
  async checkEmailExists(email, excludeId = null, isDoubleDatabase = true) {
    const { Op } = require("sequelize");
    const where = { email };

    if (excludeId) {
      where.id = { [Op.ne]: excludeId };
    }

    const existing = await this.findOne({ where }, isDoubleDatabase);
    return existing !== null;
  }
}

module.exports = new CompanyService();
