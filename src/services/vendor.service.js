const DualDatabaseService = require("./dualDatabase.service");

class VendorService extends DualDatabaseService {
  constructor() {
    super("Vendor");
  }

  /**
   * Check if email already exists
   * @param {String} email
   * @param {Number|null} excludeId
   * @param {Boolean} isDoubleDatabase
   * @returns {Boolean}
   */
  async checkVendorExists(
    vendorName,
    excludeId = null,
    isDoubleDatabase = true,
  ) {
    const { Op } = require("sequelize");
    const where = { vendor_name: vendorName };

    if (excludeId) {
      where.id = { [Op.ne]: excludeId };
    }

    const existing = await this.findOne({ where }, isDoubleDatabase);
    return existing !== null;
  }
}

module.exports = new VendorService();
