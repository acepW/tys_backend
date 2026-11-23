// Tahap 3 of docs/org-hierarchy.md: lists users, employees and recruitment requests
// whose department, division and position do not fit the hierarchy, with a
// suggested fix. Read-only (DB1): it changes nothing.
//   npm run db:report-org-hierarchy
//   npm run db:report-org-hierarchy -- --csv report.csv   (also writes a CSV file)
//   npm run db:report-org-hierarchy -- --all              (inactive records too)
const fs = require("fs");
const { models, db1, db2 } = require("../src/models");
const { placementProblems, suggestPlacement } = require("../src/services/orgHierarchy");

const SOURCES = [
  { name: "user", model: "User", label: (row) => `${row.name} <${row.email}>`, attributes: ["name", "email"] },
  { name: "employee", model: "Employee", label: (row) => `${row.employee_code} ${row.full_name}`, attributes: ["employee_code", "full_name"] },
  {
    name: "recruitment request",
    model: "RecruitmentRequest",
    label: (row) => `${row.request_no || "(no number)"} [${row.status}]`,
    attributes: ["request_no", "status"],
  },
];

const byId = async (Model) => new Map((await Model.findAll({ raw: true })).map((row) => [row.id, row]));

// Rows of one record with the problems found: hierarchy, missing or inactive masters.
function check(row, masters) {
  const ids = { id_department: row.id_department, id_division: row.id_division, id_position: row.id_position };
  const rows = {};
  const problems = [];
  for (const [field, map, label] of [
    ["id_department", masters.departments, "Department"],
    ["id_division", masters.divisions, "Division"],
    ["id_position", masters.positions, "Position"],
  ]) {
    if (ids[field] == null) continue;
    const master = map.get(ids[field]);
    if (!master) problems.push(`${label} ${ids[field]} does not exist`);
    else {
      rows[field] = master;
      if (!master.is_active) problems.push(`${label} ${ids[field]} is inactive`);
    }
  }
  problems.unshift(...placementProblems(ids, rows));
  return { ids, rows, problems };
}

function describe(masters, ids) {
  const name = (map, id, field) => (id == null ? "-" : `${id} ${map.get(id)?.[field] ?? "(missing)"}`);
  return {
    department: name(masters.departments, ids.id_department, "department_name"),
    division: name(masters.divisions, ids.id_division, "division_name"),
    position: name(masters.positions, ids.id_position, "position_name"),
  };
}

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function run() {
  const args = process.argv.slice(2);
  const csvIndex = args.indexOf("--csv");
  const csvPath = csvIndex >= 0 ? args[csvIndex + 1] : null;
  if (csvIndex >= 0 && !csvPath) throw new Error("--csv needs a file path");
  const includeInactive = args.includes("--all");

  const db = models.db1;
  const masters = {
    departments: await byId(db.Department),
    divisions: await byId(db.Division),
    positions: await byId(db.Position),
  };

  const report = [];
  for (const source of SOURCES) {
    const where = includeInactive ? {} : { is_active: true };
    const records = await db[source.model].findAll({
      where,
      attributes: ["id", "is_active", "id_department", "id_division", "id_position", ...source.attributes],
      order: [["id", "ASC"]],
      raw: true,
    });
    const found = [];
    for (const row of records) {
      const { ids, rows, problems } = check(row, masters);
      if (!problems.length) continue;
      const suggestion = suggestPlacement(ids, rows);
      found.push({
        source: source.name,
        id: row.id,
        label: source.label(row),
        is_active: !!row.is_active,
        now: describe(masters, ids),
        suggested: describe(masters, suggestion),
        problems,
      });
    }
    console.log(`\n== ${source.name}: ${found.length} of ${records.length} ${includeInactive ? "" : "active "}do not fit`);
    for (const item of found) {
      console.log(`- #${item.id} ${item.label}${item.is_active ? "" : " (inactive)"}`);
      console.log(`    now:       ${item.now.department} / ${item.now.division} / ${item.now.position}`);
      console.log(`    suggested: ${item.suggested.department} / ${item.suggested.division} / ${item.suggested.position}`);
      for (const problem of item.problems) console.log(`    ! ${problem}`);
    }
    report.push(...found);
  }

  if (csvPath) {
    const header = [
      "source", "id", "label", "is_active", "department", "division", "position",
      "suggested_department", "suggested_division", "suggested_position", "problems",
    ];
    const lines = report.map((item) => [
      item.source, item.id, item.label, item.is_active, item.now.department, item.now.division,
      item.now.position, item.suggested.department, item.suggested.division, item.suggested.position,
      item.problems.join("; "),
    ].map(csvCell).join(","));
    fs.writeFileSync(csvPath, `${[header.join(","), ...lines].join("\n")}\n`);
    console.log(`\nCSV written to ${csvPath}`);
  }
  console.log(`\nTotal: ${report.length} record(s) to fix. Suggestions follow the position first; a "-" division means one must be chosen.`);
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => Promise.allSettled([db1.close(), db2.close()]));
