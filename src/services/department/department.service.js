const DualDatabaseService = require("./../dualDatabase.service");

class DepartmentService extends DualDatabaseService {
  constructor() {
    super("Department");
  }

  /**
   * Check if department name already exists
   * @param {String} departmentName
   * @param {Number|null} excludeId
   * @param {Boolean} isDoubleDatabase
   * @returns {Boolean}
   */
  async checkDepartmentExists(
    departmentName,
    excludeId = null,
    isDoubleDatabase = true,
  ) {
    const { Op } = require("sequelize");
    const where = { department_name: departmentName };

    if (excludeId) {
      where.id = { [Op.ne]: excludeId };
    }

    const existing = await this.findOne({ where }, isDoubleDatabase);
    return existing !== null;
  }
}

module.exports = new DepartmentService();
