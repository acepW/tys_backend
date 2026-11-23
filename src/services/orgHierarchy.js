// Department -> division -> position hierarchy (2026-11-24).
// A division belongs to one department. A position belongs to a division (its
// department is copied from the division), to a department only (department-level
// position), or to neither (a position across the organisation, e.g. Direktur).
// Writes go to DB1 (and DB2 when double), so checks read DB1.
const { Op } = require("sequelize");
const { models, db1, db2 } = require("../models");

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

// Trimmed name, tabs and repeated spaces included; null when empty.
const cleanName = (value) => {
  if (value === undefined || value === null) return null;
  const name = String(value).replace(/\s+/g, " ").trim();
  return name || null;
};

// Positive integer id, or null when empty and optional.
const toId = (value, field, { optional = false } = {}) => {
  if (value === undefined || value === null || value === "") {
    if (optional) return null;
    fail(`${field} is required`);
  }
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) fail(`${field} must be a positive integer`);
  return id;
};

const LABELS = { Department: "Department", Division: "Division", Position: "Position" };

const findRow = async (modelName, id) => {
  const row = await models.db1[modelName].findByPk(id);
  return row ? (row.toJSON ? row.toJSON() : row) : null;
};

const requireActive = async (modelName, id) => {
  const row = await findRow(modelName, id);
  if (!row) fail(`${LABELS[modelName]} not found`, 404);
  if (!row.is_active) fail(`${LABELS[modelName]} ${id} is inactive`, 409);
  return row;
};

// Parents of a position from the body: id_division wins and gives the department.
const resolvePositionParents = async (body) => {
  const idDivision = toId(body.id_division, "id_division", { optional: true });
  let idDepartment = toId(body.id_department, "id_department", { optional: true });
  if (idDivision) {
    const division = await requireActive("Division", idDivision);
    if (!division.id_department) fail(`Division ${idDivision} has no department yet`, 409);
    if (idDepartment && idDepartment !== division.id_department)
      fail(`Division ${idDivision} does not belong to department ${idDepartment}`);
    idDepartment = division.id_department;
  } else if (idDepartment) {
    await requireActive("Department", idDepartment);
  }
  return { id_department: idDepartment, id_division: idDivision };
};

// Active positions to offer once a department and/or division is chosen: those of
// the division, those of the department without a division, and the global ones.
const positionListWhere = async ({ id_department, id_division } = {}, db = models.db1) => {
  const idDivision = toId(id_division, "id_division", { optional: true });
  let idDepartment = toId(id_department, "id_department", { optional: true });
  const where = { is_active: true };
  if (!idDivision && !idDepartment) return where;
  const global = { id_department: null, id_division: null };
  if (idDivision) {
    const division = await db.Division.findByPk(idDivision);
    if (!division) fail("Division not found", 404);
    if (idDepartment && division.id_department !== idDepartment)
      fail(`Division ${idDivision} does not belong to department ${idDepartment}`);
    idDepartment = division.id_department;
    where[Op.or] = [
      { id_division: idDivision },
      ...(idDepartment ? [{ id_department: idDepartment, id_division: null }] : []),
      global,
    ];
  } else {
    where[Op.or] = [{ id_department: idDepartment }, global];
  }
  return where;
};

const PLACEMENT = [
  ["id_department", "Department"],
  ["id_division", "Division"],
  ["id_position", "Position"],
];

const idOrNull = (value) => (value === undefined || value === null || value === "" ? null : Number(value));

// Whether a body changes id_department, id_division or id_position from the stored
// row (on create, whether it sends any). Forms that resend unchanged ids do not count.
const changesPlacement = (data, existing = null) =>
  PLACEMENT.some(([field]) =>
    data?.[field] !== undefined && (!existing || idOrNull(data[field]) !== idOrNull(existing[field])));

// The department, division and position after a save: sent values over stored ones.
// existing may be a plain row or a Sequelize instance.
const mergePlacement = (data, existing = null) =>
  Object.fromEntries(
    PLACEMENT.map(([field]) => [field, data?.[field] !== undefined ? data[field] : existing?.[field] ?? null]),
  );

/**
 * Checks that the department, division and position a user, employee or
 * recruitment request holds fit together (2026-11-24, tahap 2):
 * - the division belongs to the department;
 * - a position with a department/division needs that same department/division
 *   (a global position fits anywhere).
 * Each may be empty. Ids must exist; only ids that change must be active, so a
 * record keeping an inactive one can still be saved. previous is the stored row
 * on update, null on create. Callers on update only call it when one of the three
 * changes, so editing other fields of old, mismatched data still works.
 */
const assertPlacement = async (next, previous = null) => {
  const ids = {};
  const rows = {};
  for (const [field, modelName] of PLACEMENT) {
    ids[field] = toId(next[field], field, { optional: true });
    if (!ids[field]) continue;
    const row = await findRow(modelName, ids[field]);
    if (!row) fail(`${LABELS[modelName]} not found`, 404);
    const before = previous?.[field] == null ? null : Number(previous[field]);
    if (!row.is_active && before !== ids[field]) fail(`${LABELS[modelName]} ${ids[field]} is inactive`, 409);
    rows[field] = row;
  }
  const [problem] = placementProblems(ids, rows);
  if (problem) fail(problem);
};

/**
 * Why a department/division/position combination does not fit, as messages
 * (empty when it fits). ids: the three ids (numbers or null); rows: the division
 * and position rows by field (id_division, id_position), when they exist.
 * Shared by assertPlacement and the tahap 3 report.
 */
const placementProblems = (ids, rows) => {
  const problems = [];
  const department = ids.id_department ?? "(none)";
  const division = rows.id_division;
  if (division && division.id_department !== ids.id_department)
    problems.push(`Division ${division.division_name} does not belong to department ${department}`);
  const position = rows.id_position;
  if (position?.id_department && position.id_department !== ids.id_department)
    problems.push(`Position ${position.position_name} belongs to department ${position.id_department}, not ${department}`);
  if (position?.id_division && position.id_division !== ids.id_division)
    problems.push(`Position ${position.position_name} belongs to division ${position.id_division}, not ${ids.id_division ?? "(none)"}`);
  return problems;
};

/**
 * A combination that fits, kept as close to the current one as possible: the
 * position decides first (it carries the access rights and approvals), then the
 * division. id_division is null when the department has to be chosen again and the
 * current division does not belong to it. Used by the tahap 3 report.
 */
const suggestPlacement = (ids, rows) => {
  const position = rows.id_position;
  const division = rows.id_division;
  if (position?.id_division)
    return { id_department: position.id_department, id_division: position.id_division, id_position: ids.id_position };
  if (position?.id_department) {
    const keepDivision = division && division.id_department === position.id_department;
    return { id_department: position.id_department, id_division: keepDivision ? ids.id_division : null, id_position: ids.id_position };
  }
  if (division) return { id_department: division.id_department, id_division: ids.id_division, id_position: ids.id_position };
  return { ...ids };
};

// A department with active divisions or positions cannot be deactivated.
const assertDepartmentCanDeactivate = async (id) => {
  const [divisions, positions] = await Promise.all([
    models.db1.Division.count({ where: { id_department: id, is_active: true } }),
    models.db1.Position.count({ where: { id_department: id, is_active: true } }),
  ]);
  if (divisions || positions)
    fail(`Department still has ${divisions} active division(s) and ${positions} active position(s)`, 409);
};

const assertDivisionCanDeactivate = async (id) => {
  const positions = await models.db1.Position.count({ where: { id_division: id, is_active: true } });
  if (positions) fail(`Division still has ${positions} active position(s)`, 409);
};

// Whether another active row already has this name (inactive rows are ignored).
const nameTaken = async (modelName, field, name, excludeId = null) => {
  const where = { [field]: name, is_active: true };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  return (await models.db1[modelName].count({ where })) > 0;
};

// Runs work(dbModels, transaction) on DB1, and on DB2 too when double; all or nothing.
const writeAll = async (isDoubleDatabase, work) => {
  const connections = isDoubleDatabase ? [[db1, models.db1], [db2, models.db2]] : [[db1, models.db1]];
  const transactions = [];
  try {
    for (const [connection, dbModels] of connections) {
      const transaction = await connection.transaction();
      transactions.push(transaction);
      await work(dbModels, transaction);
    }
    for (const transaction of transactions) await transaction.commit();
  } catch (error) {
    for (const transaction of transactions) await transaction.rollback().catch(() => {});
    throw error;
  }
};

const departmentInclude = (db, as = "department") => ({
  model: db.Department, as, attributes: ["id", "department_name"], required: false,
});
const divisionInclude = (db) => ({
  model: db.Division, as: "division", attributes: ["id", "division_name", "division_code"], required: false,
});

module.exports = {
  fail,
  cleanName,
  toId,
  requireActive,
  findRow,
  resolvePositionParents,
  positionListWhere,
  changesPlacement,
  mergePlacement,
  assertPlacement,
  placementProblems,
  suggestPlacement,
  assertDepartmentCanDeactivate,
  assertDivisionCanDeactivate,
  nameTaken,
  writeAll,
  departmentInclude,
  divisionInclude,
};
