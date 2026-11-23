const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const org = require("../src/services/orgHierarchy");
const departmentService = require("../src/services/department/department.service");
const divisionService = require("../src/services/division.service");
const positionService = require("../src/services/position/position.service");
const { models, db1, db2 } = require("../src/models");

// In-memory departments, divisions and positions behind the DB1/DB2 models.
function mockOrg(t, { departments = [], divisions = [], positions = [] } = {}) {
  const tables = { Department: departments, Division: divisions, Position: positions };
  const writes = [];
  const originals = [];
  const swap = (target, key, value) => {
    originals.push([target, key, target[key]]);
    target[key] = value;
  };
  const matches = (row, where = {}) =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === "object" && Op.ne in value) return row[key] !== value[Op.ne];
      return (row[key] ?? null) === value;
    });
  for (const db of [models.db1, models.db2]) {
    for (const [name, rows] of Object.entries(tables)) {
      const Model = db[name];
      swap(Model, "findByPk", async (id) => {
        const row = rows.find((item) => item.id === Number(id));
        return row ? { ...row, toJSON: () => ({ ...row }) } : null;
      });
      swap(Model, "count", async ({ where }) => rows.filter((row) => matches(row, where)).length);
      swap(Model, "update", async (data, { where }) => {
        writes.push({ db: db === models.db1 ? "db1" : "db2", model: name, data, where });
        return [rows.filter((row) => matches(row, where)).length];
      });
      swap(Model, "create", async (data) => {
        writes.push({ db: db === models.db1 ? "db1" : "db2", model: name, data, create: true });
        return { id: 99, ...data, toJSON() { return { id: 99, ...data }; } };
      });
    }
  }
  const transaction = async () => ({ commit: async () => {}, rollback: async () => {} });
  swap(db1, "transaction", transaction);
  swap(db2, "transaction", transaction);
  t.after(() => { for (const [target, key, value] of originals.reverse()) target[key] = value; });
  return writes;
}

const departments = [
  { id: 1, department_name: "HRGA", is_active: true },
  { id: 2, department_name: "Internal FAT", is_active: true },
  { id: 3, department_name: "Old", is_active: false },
];
const divisions = [
  { id: 2, division_name: "Human Resources", id_department: 1, is_active: true },
  { id: 3, division_name: "General Affairs", id_department: 1, is_active: false },
  { id: 5, division_name: "Internal FAT", id_department: 2, is_active: true },
];

test("names are trimmed of spaces and tabs", () => {
  assert.equal(org.cleanName("   \t Sales & Marketing  Staff "), "Sales & Marketing Staff");
  assert.equal(org.cleanName(" \t "), null);
  assert.equal(org.cleanName(undefined), null);
});

test("a position's department comes from its division", async (t) => {
  mockOrg(t, { departments, divisions });
  assert.deepEqual(await org.resolvePositionParents({ id_division: "2" }), { id_department: 1, id_division: 2 });
  assert.deepEqual(await org.resolvePositionParents({ id_department: 1, id_division: 2 }), { id_department: 1, id_division: 2 });
  assert.deepEqual(await org.resolvePositionParents({ id_department: 2 }), { id_department: 2, id_division: null });
  assert.deepEqual(await org.resolvePositionParents({}), { id_department: null, id_division: null });
});

test("a position cannot mix a division with another department or hang under an inactive parent", async (t) => {
  mockOrg(t, { departments, divisions });
  await assert.rejects(org.resolvePositionParents({ id_department: 2, id_division: 2 }),
    (error) => error.statusCode === 400 && /does not belong to department 2/.test(error.message));
  await assert.rejects(org.resolvePositionParents({ id_division: 3 }), (error) => error.statusCode === 409);
  await assert.rejects(org.resolvePositionParents({ id_department: 3 }), (error) => error.statusCode === 409);
  await assert.rejects(org.resolvePositionParents({ id_division: 77 }), (error) => error.statusCode === 404);
  await assert.rejects(org.resolvePositionParents({ id_division: "x" }), (error) => error.statusCode === 400);
});

test("position list by division offers its positions, its department's own positions and global ones", async (t) => {
  mockOrg(t, { departments, divisions });
  const global = { id_department: null, id_division: null };
  assert.deepEqual(await org.positionListWhere({}), { is_active: true });
  const byDivision = await org.positionListWhere({ id_division: "2" });
  assert.deepEqual(byDivision[Op.or], [{ id_division: 2 }, { id_department: 1, id_division: null }, global]);
  const byDepartment = await org.positionListWhere({ id_department: "1" });
  assert.deepEqual(byDepartment[Op.or], [{ id_department: 1 }, global]);
  await assert.rejects(org.positionListWhere({ id_department: 2, id_division: 2 }), (error) => error.statusCode === 400);
});

test("a division needs an active department", async (t) => {
  const writes = mockOrg(t, { departments, divisions });
  await assert.rejects(divisionService.createDivision({ division_name: "Payroll", division_code: "PAY" }),
    (error) => error.statusCode === 400 && /id_department is required/.test(error.message));
  await assert.rejects(divisionService.createDivision({ division_name: "Payroll", division_code: "PAY", id_department: 3 }),
    (error) => error.statusCode === 409);
  await divisionService.createDivision({ division_name: " Payroll\t", division_code: "PAY", id_department: 1 });
  assert.deepEqual(writes.filter((w) => w.create).map((w) => [w.db, w.data.division_name, w.data.id_department]),
    [["db1", "Payroll", 1], ["db2", "Payroll", 1]]);
});

test("moving a division to another department moves its positions in both databases", async (t) => {
  const writes = mockOrg(t, { departments, divisions });
  await divisionService.updateDivision(2, { id_department: 2 });
  assert.deepEqual(writes.map((w) => [w.db, w.model, w.data, w.where]), [
    ["db1", "Division", { id_department: 2 }, { id: 2 }],
    ["db1", "Position", { id_department: 2 }, { id_division: 2 }],
    ["db2", "Division", { id_department: 2 }, { id: 2 }],
    ["db2", "Position", { id_department: 2 }, { id_division: 2 }],
  ]);
});

test("a department or division with active children cannot be deactivated", async (t) => {
  mockOrg(t, {
    departments,
    divisions,
    positions: [{ id: 11, position_name: "HR Staff", id_department: 1, id_division: 2, is_active: true }],
  });
  await assert.rejects(departmentService.deactivateDepartment(1),
    (error) => error.statusCode === 409 && /1 active division\(s\) and 1 active position\(s\)/.test(error.message));
  await assert.rejects(departmentService.updateDepartment(1, { is_active: false }), (error) => error.statusCode === 409);
  await assert.rejects(divisionService.deactivateDivision(2),
    (error) => error.statusCode === 409 && /1 active position/.test(error.message));
});

test("a position name is unique among active positions only", async (t) => {
  const writes = mockOrg(t, {
    departments,
    divisions,
    positions: [
      { id: 4, position_name: "Sales & Marketing Manager", id_department: 1, id_division: null, is_active: true },
      { id: 5, position_name: "Sales & Marketing Manager", id_department: 1, id_division: null, is_active: false },
    ],
  });
  // Renaming 4 to its own name is not blocked by the inactive duplicate 5.
  await positionService.updatePosition(4, { position_name: "Sales & Marketing Manager" });
  // Reactivating 5 would duplicate 4.
  await assert.rejects(positionService.updatePosition(5, { is_active: true }),
    (error) => error.statusCode === 400 && /already exists/.test(error.message));
  await assert.rejects(positionService.createPosition({ position_name: " Sales & Marketing Manager " }),
    (error) => error.statusCode === 400);
  assert.equal(writes.filter((w) => w.create).length, 0);
});

test("a position cannot be reactivated under an inactive division", async (t) => {
  mockOrg(t, {
    departments,
    divisions,
    positions: [{ id: 12, position_name: "GA Staff", id_department: 1, id_division: 3, is_active: false }],
  });
  await assert.rejects(positionService.updatePosition(12, { is_active: true }),
    (error) => error.statusCode === 409 && /Division 3 is inactive/.test(error.message));
});

test("updating a position's parents replaces both", async (t) => {
  const writes = mockOrg(t, {
    departments,
    divisions,
    positions: [{ id: 7, position_name: "Internal FAT Staff", id_department: 2, id_division: 5, is_active: true }],
  });
  await positionService.updatePosition(7, { id_department: 2 });
  assert.deepEqual(writes[0].data, { id_department: 2, id_division: null });
});

// Tahap 2: department, division and position held together by a user, employee or
// recruitment request.
const placementMasters = () => ({
  departments,
  divisions,
  positions: [
    { id: 1, position_name: "Developer", id_department: null, id_division: null, is_active: true },
    { id: 10, position_name: "HRGA Supervisor", id_department: 1, id_division: null, is_active: true },
    { id: 11, position_name: "HR Staff", id_department: 1, id_division: 2, is_active: true },
    { id: 12, position_name: "GA Staff", id_department: 1, id_division: 3, is_active: false },
  ],
});

test("a placement fits when the division and position belong to the department", async (t) => {
  mockOrg(t, placementMasters());
  await org.assertPlacement({ id_department: 1, id_division: 2, id_position: 11 });
  await org.assertPlacement({ id_department: "1", id_division: "2", id_position: "10" }); // department-level
  await org.assertPlacement({ id_department: 2, id_division: 5, id_position: 1 }); // global position
  await org.assertPlacement({ id_department: 1, id_division: null, id_position: 10 });
  await org.assertPlacement({ id_department: null, id_division: null, id_position: null });
});

test("a placement does not fit across departments or divisions", async (t) => {
  mockOrg(t, placementMasters());
  const rejects = (placement, pattern) =>
    assert.rejects(org.assertPlacement(placement), (error) => error.statusCode === 400 && pattern.test(error.message));
  await rejects({ id_department: 2, id_division: 2, id_position: 1 }, /Division Human Resources does not belong to department 2/);
  await rejects({ id_department: null, id_division: 2 }, /does not belong to department \(none\)/);
  await rejects({ id_department: 2, id_division: 5, id_position: 10 }, /HRGA Supervisor belongs to department 1, not 2/);
  await rejects({ id_department: 1, id_division: null, id_position: 11 }, /HR Staff belongs to division 2, not \(none\)/);
  await assert.rejects(org.assertPlacement({ id_department: 1, id_position: 99 }), (error) => error.statusCode === 404);
});

test("only a changed department, division or position must be active", async (t) => {
  mockOrg(t, placementMasters());
  const inactive = { id_department: 1, id_division: 3, id_position: 12 };
  await assert.rejects(org.assertPlacement(inactive), (error) => error.statusCode === 409);
  await org.assertPlacement(inactive, { id_department: 1, id_division: 3, id_position: 12 });
  await assert.rejects(org.assertPlacement(inactive, { id_department: 1, id_division: 3, id_position: 11 }),
    (error) => error.statusCode === 409 && /Position 12 is inactive/.test(error.message));
});

test("sent placement values replace stored ones", () => {
  const stored = { id_department: 1, id_division: 2, id_position: 11, name: "A" };
  assert.equal(org.changesPlacement({ name: "B" }), false);
  assert.equal(org.changesPlacement({ id_position: null }), true);
  // A form resending the stored ids, as numbers or strings, changes nothing.
  assert.equal(org.changesPlacement({ id_department: "1", id_division: 2, id_position: 11, name: "B" }, stored), false);
  assert.equal(org.changesPlacement({ id_position: "10" }, stored), true);
  assert.equal(org.changesPlacement({ id_division: "" }, stored), true);
  assert.equal(org.changesPlacement({ id_division: null }, { id_division: null }), false);
  assert.deepEqual(org.mergePlacement({ id_position: 10, id_division: null }, stored),
    { id_department: 1, id_division: null, id_position: 10 });
  assert.deepEqual(org.mergePlacement({ id_department: 2 }), { id_department: 2, id_division: null, id_position: null });
});

// Tahap 3: report of records that do not fit, with a suggested fix.
test("a suggested placement follows the position first, then the division", () => {
  const division = (id, idDepartment) => ({ id, division_name: `D${id}`, id_department: idDepartment });
  const position = (id, idDepartment, idDivision) =>
    ({ id, position_name: `P${id}`, id_department: idDepartment, id_division: idDivision });
  // Division position: department and division come from it.
  assert.deepEqual(org.suggestPlacement({ id_department: 1, id_division: 1, id_position: 9 },
    { id_division: division(1, 3), id_position: position(9, 2, 5) }), { id_department: 2, id_division: 5, id_position: 9 });
  // Department-level position: a division of another department must be chosen again.
  assert.deepEqual(org.suggestPlacement({ id_department: 3, id_division: 2, id_position: 4 },
    { id_division: division(2, 1), id_position: position(4, 3, null) }), { id_department: 3, id_division: null, id_position: 4 });
  assert.deepEqual(org.suggestPlacement({ id_department: 1, id_division: 4, id_position: 4 },
    { id_division: division(4, 3), id_position: position(4, 3, null) }), { id_department: 3, id_division: 4, id_position: 4 });
  // Global position: the department follows the division.
  assert.deepEqual(org.suggestPlacement({ id_department: 1, id_division: 1, id_position: 3 },
    { id_division: division(1, 3), id_position: position(3, null, null) }), { id_department: 3, id_division: 1, id_position: 3 });
  // The suggestion always fits.
  assert.deepEqual(org.placementProblems({ id_department: 2, id_division: 5, id_position: 9 },
    { id_division: division(5, 2), id_position: position(9, 2, 5) }), []);
  assert.equal(org.placementProblems({ id_department: 1, id_division: 1, id_position: 9 },
    { id_division: division(1, 3), id_position: position(9, 2, 5) }).length, 3);
});

test("a division needs a code", async (t) => {
  mockOrg(t, { departments, divisions });
  await assert.rejects(divisionService.createDivision({ division_name: "Payroll", division_code: " ", id_department: 1 }),
    (error) => error.statusCode === 400 && /Division code is required/.test(error.message));
});
