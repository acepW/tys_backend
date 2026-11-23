const DualDatabaseService = require("./../dualDatabase.service");
const org = require("../orgHierarchy");

class DepartmentService extends DualDatabaseService {
  constructor() {
    super("Department");
  }

  async createDepartment(body, isDoubleDatabase = true) {
    const name = org.cleanName(body.department_name);
    if (!name) org.fail("Department name is required");
    if (await org.nameTaken("Department", "department_name", name))
      org.fail("Department already exists");
    return this.create(
      { department_name: name, is_active: body.is_active !== undefined ? body.is_active : true },
      isDoubleDatabase,
    );
  }

  async updateDepartment(id, body, isDoubleDatabase = true) {
    const existing = await org.findRow("Department", id);
    if (!existing) org.fail("Department not found", 404);
    const data = {};
    const name = org.cleanName(body.department_name);
    if (name) data.department_name = name;
    if (body.is_active !== undefined) data.is_active = body.is_active;

    const willBeActive = data.is_active !== undefined ? !!data.is_active : !!existing.is_active;
    if (existing.is_active && !willBeActive) await org.assertDepartmentCanDeactivate(id);
    if (willBeActive && (name || !existing.is_active)) {
      if (await org.nameTaken("Department", "department_name", name || existing.department_name, id))
        org.fail("Department already exists");
    }
    return this.update(id, data, isDoubleDatabase);
  }

  async deactivateDepartment(id, isDoubleDatabase = true) {
    const existing = await org.findRow("Department", id);
    if (!existing) org.fail("Department not found", 404);
    await org.assertDepartmentCanDeactivate(id);
    return this.update(id, { is_active: false }, isDoubleDatabase);
  }
}

module.exports = new DepartmentService();
