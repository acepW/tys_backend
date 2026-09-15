const { Op } = require("sequelize");
const DualDatabaseService = require("../dualDatabase.service");
const { models } = require("../../models");

class EmployeeService extends DualDatabaseService {
  constructor() {
    super("Employee");
  }

  async getAll(options = {}, page = 1, limit = 20, search = null) {
    const where = { ...(options.where || {}) };
    if (search) {
      const pattern = `%${search}%`;
      where[Op.or] = [
        { employee_code: { [Op.like]: pattern } },
        { device_user_id: { [Op.like]: pattern } },
        { full_name: { [Op.like]: pattern } },
        { email: { [Op.like]: pattern } },
      ];
    }

    const result = await models.db1.Employee.findAndCountAll({
      where,
      include: [
        { model: models.db1.Company, as: "company", required: false },
        { model: models.db1.Division, as: "division", required: false },
        { model: models.db1.Department, as: "department", required: false },
        { model: models.db1.Position, as: "position", required: false },
      ],
      order: [["full_name", "ASC"]],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });

    return {
      data: result.rows.map((row) => row.toJSON()),
      pagination: {
        total: result.count,
        page,
        limit,
        total_pages: Math.ceil(result.count / limit),
      },
    };
  }

  async findDuplicate(employeeCode, deviceUserId, excludeId = null) {
    const where = {
      [Op.or]: [
        { employee_code: employeeCode },
        { device_user_id: deviceUserId },
      ],
    };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    return models.db1.Employee.findOne({ where });
  }
}

module.exports = new EmployeeService();
