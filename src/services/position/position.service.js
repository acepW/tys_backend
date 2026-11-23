const DualDatabaseService = require("./../dualDatabase.service");
const positionMenuService = require("../../services/position/positionMenu.service");
const { models } = require("../../models");
const org = require("../orgHierarchy");

const parentIncludes = (db) => [org.departmentInclude(db), org.divisionInclude(db)];

class PositionService extends DualDatabaseService {
  constructor() {
    super("Position");
  }

  /**
   * Active positions. With id_department and/or id_division: the positions of that
   * division, of that department without a division, and the global ones.
   */
  async list(filter = {}, isDoubleDatabase = true) {
    const db = isDoubleDatabase ? models.db1 : models.db2;
    const where = await org.positionListWhere(filter, db);
    return this.findAll({ where, include: parentIncludes(db) }, isDoubleDatabase);
  }

  /**
   * Get position by ID with its department, division, and all menus + permissions
   */
  async getByIdWithMenus(id, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const position = await dbModels.Position.findByPk(id, { include: parentIncludes(dbModels) });

    if (!position) return null;

    const menuAccess = await positionMenuService.getByPosition(
      id,
      isDoubleDatabase,
    );

    return {
      ...position.toJSON(),
      menu_access: menuAccess,
    };
  }

  async createPosition(body, isDoubleDatabase = true) {
    const name = org.cleanName(body.position_name);
    if (!name) org.fail("Position name is required");
    const parents = await org.resolvePositionParents(body);
    if (await org.nameTaken("Position", "position_name", name)) org.fail("Position already exists");
    return this.create(
      {
        position_name: name,
        ...parents,
        is_active: body.is_active !== undefined ? body.is_active : true,
      },
      isDoubleDatabase,
    );
  }

  /**
   * Sending id_department or id_division replaces both: a missing one counts as null.
   */
  async updatePosition(id, body, isDoubleDatabase = true) {
    const existing = await org.findRow("Position", id);
    if (!existing) org.fail("Position not found", 404);
    const data = {};
    const name = org.cleanName(body.position_name);
    if (name) data.position_name = name;
    if (body.is_active !== undefined) data.is_active = body.is_active;

    const parentsSent = body.id_department !== undefined || body.id_division !== undefined;
    const willBeActive = data.is_active !== undefined ? !!data.is_active : !!existing.is_active;
    if (parentsSent) {
      Object.assign(data, await org.resolvePositionParents(body));
    } else if (willBeActive && !existing.is_active) {
      // Reactivating under an inactive department or division is not allowed.
      if (existing.id_division) await org.requireActive("Division", existing.id_division);
      if (existing.id_department) await org.requireActive("Department", existing.id_department);
    }
    if (willBeActive && (name || !existing.is_active)) {
      if (await org.nameTaken("Position", "position_name", name || existing.position_name, id))
        org.fail("Position already exists");
    }
    return this.update(id, data, isDoubleDatabase);
  }

  async deactivatePosition(id, isDoubleDatabase = true) {
    const existing = await org.findRow("Position", id);
    if (!existing) org.fail("Position not found", 404);
    return this.update(id, { is_active: false }, isDoubleDatabase);
  }
}

module.exports = new PositionService();
