const DualDatabaseService = require("./dualDatabase.service");
const { models } = require("../models");
const org = require("./orgHierarchy");

class DivisionService extends DualDatabaseService {
  constructor() {
    super("Division");
  }

  /** Active divisions, optionally of one department, with their department. */
  async list({ id_department } = {}, isDoubleDatabase = true) {
    const db = isDoubleDatabase ? models.db1 : models.db2;
    const where = { is_active: true };
    const idDepartment = org.toId(id_department, "id_department", { optional: true });
    if (idDepartment) where.id_department = idDepartment;
    return this.findAll({ where, include: [org.departmentInclude(db)] }, isDoubleDatabase);
  }

  async getById(id, isDoubleDatabase = true) {
    const db = isDoubleDatabase ? models.db1 : models.db2;
    return this.findById(id, { include: [org.departmentInclude(db)] }, isDoubleDatabase);
  }

  async createDivision(body, isDoubleDatabase = true) {
    const name = org.cleanName(body.division_name);
    if (!name) org.fail("Division name is required");
    const code = org.cleanName(body.division_code);
    if (!code) org.fail("Division code is required");
    const idDepartment = org.toId(body.id_department, "id_department");
    await org.requireActive("Department", idDepartment);
    if (await org.nameTaken("Division", "division_name", name)) org.fail("Division already exists");
    return this.create(
      {
        division_name: name,
        division_code: code,
        id_department: idDepartment,
        is_active: body.is_active !== undefined ? body.is_active : true,
      },
      isDoubleDatabase,
    );
  }

  /**
   * Moving a division to another department moves its positions with it
   * (positions.id_department is a copy of the division's department).
   */
  async updateDivision(id, body, isDoubleDatabase = true) {
    const existing = await org.findRow("Division", id);
    if (!existing) org.fail("Division not found", 404);
    const data = {};
    const name = org.cleanName(body.division_name);
    if (name) {
      if (existing.is_active && (await org.nameTaken("Division", "division_name", name, id)))
        org.fail("Division already exists");
      data.division_name = name;
    }
    const code = org.cleanName(body.division_code);
    if (code) data.division_code = code;
    if (body.id_department !== undefined) {
      const idDepartment = org.toId(body.id_department, "id_department");
      if (idDepartment !== existing.id_department) {
        await org.requireActive("Department", idDepartment);
        data.id_department = idDepartment;
      }
    }
    if (!data.id_department) return this.update(id, data, isDoubleDatabase);

    await org.writeAll(isDoubleDatabase, async (db, transaction) => {
      await db.Division.update(data, { where: { id }, transaction });
      await db.Position.update(
        { id_department: data.id_department },
        { where: { id_division: id }, transaction },
      );
    });
    return this.getById(id);
  }

  async deactivateDivision(id, isDoubleDatabase = true) {
    const existing = await org.findRow("Division", id);
    if (!existing) org.fail("Division not found", 404);
    await org.assertDivisionCanDeactivate(id);
    return this.update(id, { is_active: false }, isDoubleDatabase);
  }
}

module.exports = new DivisionService();
