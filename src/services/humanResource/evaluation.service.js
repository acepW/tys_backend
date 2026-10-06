const DualDatabaseService = require("../dualDatabase.service");
const { models } = require("../../models");

class EvaluationService extends DualDatabaseService {
  constructor() {
    super("Evaluation");
  }

  _relations() {
    const db = models.db1;
    return [
      {
        model: db.Employee,
        as: "employee",
        attributes: ["id", "employee_code", "full_name", "hire_date"],
      },
      { model: db.Position, as: "position", required: false },
      { model: db.Department, as: "department", required: false },
      {
        model: db.User,
        as: "user_create",
        attributes: ["id", "name", "email"],
        required: false,
      },
    ];
  }

  async getAll(where = {}, page = null, limit = null) {
    const options = {
      where,
      include: this._relations(),
      order: [["createdAt", "DESC"]],
    };
    if (!page || !limit) {
      return (await models.db1.Evaluation.findAll(options)).map(
        (row) => row.toJSON(),
      );
    }
    const { count, rows } = await models.db1.Evaluation.findAndCountAll({
      ...options,
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });
    return {
      data: rows.map((row) => row.toJSON()),
      pagination: {
        total_data: count,
        total_page: Math.ceil(count / limit),
        current_page: page,
        per_page: limit,
      },
    };
  }

  async getById(id) {
    const row = await models.db1.Evaluation.findByPk(id, {
      include: this._relations(),
    });
    return row?.toJSON() || null;
  }

  // Position, department and hire date default to the employee's current data.
  async createEvaluation(data, isDoubleDatabase = true) {
    const employee = await models.db1.Employee.findByPk(data.id_employee);
    if (!employee) {
      const error = new Error("Employee not found");
      error.statusCode = 404;
      throw error;
    }
    const payload = {
      ...data,
      id_position: data.id_position ?? employee.id_position ?? null,
      id_department: data.id_department ?? employee.id_department ?? null,
      hire_date: data.hire_date ?? employee.hire_date ?? null,
    };
    const created = isDoubleDatabase
      ? await this.create(payload, true)
      : (await this.Model1.create(payload)).toJSON();
    return this.getById(created.id);
  }
}

module.exports = new EvaluationService();
