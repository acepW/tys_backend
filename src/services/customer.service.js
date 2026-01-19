const DualDatabaseService = require("./dualDatabase.service");

class CustomerService extends DualDatabaseService {
  constructor() {
    super("Customer");
  }

  /**
   * Get active customers
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Active customers
   */
  async getActiveCustomers(isDoubleDatabase = true) {
    const options = {
      where: { is_active: true },
      order: [["company_name", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Search customers by company name
   * @param {String} searchTerm
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Matching customers
   */
  async searchByCompanyName(searchTerm, isDoubleDatabase = true) {
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

module.exports = new CustomerService();
