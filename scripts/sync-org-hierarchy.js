// Department -> division -> position hierarchy (2026-11-24). See docs/org-hierarchy.md.
// Safe to run more than once, in DB1 and DB2:
//   1. Adds divisions.id_department, positions.id_department and positions.id_division,
//      nullable at first, with their foreign keys.
//   2. Fills them from the mapping below, only where still empty. Each mapped id is
//      checked against its expected name first; on any mismatch nothing is written.
//      Positions not in the mapping stay global (both null).
//   3. Trims spaces and tabs around department, division and position names.
//   4. Makes divisions.id_department NOT NULL once every division has one, and adds
//      the indexes.
const { models, db1, db2 } = require("../src/models");
const { cleanName } = require("../src/services/orgHierarchy");

const databases = [["db1", models.db1], ["db2", models.db2]];

// division id -> [expected division name, department id, expected department name]
const DIVISIONS = {
  1: ["Sales & Marketing", 3, "Sales & Marketing"],
  2: ["Human Resources", 1, "Human Resources & General Affairs"],
  3: ["General Affairs", 1, "Human Resources & General Affairs"],
  4: ["Social Media", 3, "Sales & Marketing"],
  5: ["Internal FAT", 2, "Internal FAT"],
  6: ["Internal Legal Affairs", 4, "Internal Legal Affairs"],
  7: ["Export Import Regulatory", 5, "Export Import"],
  8: ["Customer Service EXIM", 5, "Export Import"],
  9: ["External Legal Affairs", 6, "External Legal Affairs"],
  10: ["Customer Service Legal", 6, "External Legal Affairs"],
  11: ["Product Regulatory", 7, "Product Certification"],
  12: ["Product Certification 2nd", 7, "Product Certification"],
  13: ["Customer Service Product Regulatory", 7, "Product Certification"],
  14: ["External FAT", 8, "External FAT"],
  15: ["Customer Service External FAT", 8, "External FAT"],
  16: ["Customer Service Product Certification", 7, "Product Certification"],
};

// position id -> [expected position name, { id_division } | { id_department }]
// Developer (1), Staff (2), Direktur (3) and Internal Manager (13) stay global.
const POSITIONS = {
  4: ["Sales & Marketing Manager", { id_department: 3 }],
  5: ["Sales & Marketing Manager", { id_department: 3 }],
  6: ["Sales & Marketing Staff", { id_division: 1 }],
  7: ["Internal FAT Staff", { id_division: 5 }],
  8: ["Internal FAT Supervisor", { id_division: 5 }],
  9: ["Internal FAT Manager", { id_division: 5 }],
  10: ["HRGA Supervisor", { id_department: 1 }],
  11: ["HR Staff", { id_division: 2 }],
  12: ["GA Staff", { id_division: 3 }],
};

const same = (a, b) => (cleanName(a) || "").toLowerCase() === (cleanName(b) || "").toLowerCase();

async function addNullableColumn(name, model, table, column) {
  const queryInterface = model.sequelize.getQueryInterface();
  const existing = await queryInterface.describeTable(table);
  if (existing[column]) return;
  await queryInterface.addColumn(table, column, { ...model.rawAttributes[column], allowNull: true });
  console.log(`[${name}] + ${table}.${column}`);
}

async function checkNames(name, db) {
  const byId = async (Model) =>
    new Map((await Model.findAll({ raw: true })).map((row) => [row.id, row]));
  const [departments, divisions, positions] = await Promise.all([
    byId(db.Department), byId(db.Division), byId(db.Position),
  ]);
  const problems = [];
  const expect = (rows, id, label, expected, field) => {
    const row = rows.get(Number(id));
    if (!row) problems.push(`${label} ${id} is missing`);
    else if (!same(row[field], expected))
      problems.push(`${label} ${id} is "${row[field]}", expected "${expected}"`);
  };
  // Rows already filled (an earlier run or the master form) are not checked again.
  for (const [id, [divisionName, idDepartment, departmentName]] of Object.entries(DIVISIONS)) {
    if (divisions.get(Number(id))?.id_department) continue;
    expect(divisions, id, "division", divisionName, "division_name");
    expect(departments, idDepartment, "department", departmentName, "department_name");
  }
  for (const [id, [positionName, parents]] of Object.entries(POSITIONS)) {
    const row = positions.get(Number(id));
    if (row?.id_department || row?.id_division) continue;
    expect(positions, id, "position", positionName, "position_name");
    if (parents.id_division) {
      const [divisionName] = DIVISIONS[parents.id_division];
      expect(divisions, parents.id_division, "division", divisionName, "division_name");
    }
  }
  if (problems.length) throw new Error(`[${name}] mapping does not match:\n  ${problems.join("\n  ")}`);
}

async function backfill(name, db) {
  let divisions = 0;
  let positions = 0;
  for (const [id, [, idDepartment]] of Object.entries(DIVISIONS)) {
    const [count] = await db.Division.update(
      { id_department: idDepartment },
      { where: { id: Number(id), id_department: null } },
    );
    divisions += count;
  }
  for (const [id, [, parents]] of Object.entries(POSITIONS)) {
    const values = parents.id_division
      ? { id_division: parents.id_division, id_department: DIVISIONS[parents.id_division][1] }
      : { id_department: parents.id_department };
    const [count] = await db.Position.update(values, {
      where: { id: Number(id), id_department: null, id_division: null },
    });
    positions += count;
  }
  console.log(`[${name}] divisions given a department: ${divisions}, positions given a parent: ${positions}`);
}

async function trimNames(name, db) {
  for (const [Model, field] of [
    [db.Department, "department_name"], [db.Division, "division_name"], [db.Position, "position_name"],
  ]) {
    for (const row of await Model.findAll({ attributes: ["id", field], raw: true })) {
      const clean = cleanName(row[field]);
      if (!clean || clean === row[field]) continue;
      await Model.update({ [field]: clean }, { where: { id: row.id } });
      console.log(`[${name}] ~ ${Model.tableName} ${row.id}: ${JSON.stringify(row[field])} -> "${clean}"`);
    }
  }
}

async function finalize(name, db) {
  const queryInterface = db.Division.sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable("divisions");
  if (columns.id_department.allowNull) {
    const missing = await db.Division.count({ where: { id_department: null } });
    if (missing) {
      console.warn(`[${name}] ${missing} division(s) still have no department; id_department stays nullable`);
    } else {
      const attribute = db.Division.rawAttributes.id_department;
      // The foreign key was added with the column; only the nullability changes.
      await queryInterface.changeColumn("divisions", "id_department", {
        type: attribute.type, allowNull: false, comment: attribute.comment,
      });
      console.log(`[${name}] ~ divisions.id_department NOT NULL`);
    }
  }
  for (const [Model, indexNames] of [
    [db.Division, ["idx_division_department"]],
    [db.Position, ["idx_position_department", "idx_position_division"]],
  ]) {
    const existing = (await queryInterface.showIndex(Model.tableName)).map((index) => index.name);
    for (const index of Model.options.indexes.filter((item) => indexNames.includes(item.name))) {
      if (existing.includes(index.name)) continue;
      await queryInterface.addIndex(Model.tableName, index.fields, { name: index.name });
      console.log(`[${name}] + index ${index.name}`);
    }
  }
}

const run = async () => {
  try {
    for (const [name, db] of databases) {
      await addNullableColumn(name, db.Division, "divisions", "id_department");
      await addNullableColumn(name, db.Position, "positions", "id_department");
      await addNullableColumn(name, db.Position, "positions", "id_division");
    }
    for (const [name, db] of databases) await checkNames(name, db);
    for (const [name, db] of databases) {
      await backfill(name, db);
      await trimNames(name, db);
      await finalize(name, db);
    }
    console.log("Org hierarchy synchronized successfully");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
