// Creates the recruitment tables (and the levels master) in foreign-key order, then
// brings an existing recruitment_requests table up to the candidate request form:
//   - job_recruitment is renamed to job_requirement;
//   - job_title (replaced by id_level) becomes nullable and is kept for old rows;
//   - new columns are added (company, department, division, level, number of people,
//     request type, reason, hiring deadline, hiring status = open);
//   - status becomes the approval stages: "pending" (waiting for HR Staff) is renamed
//     to "request hr staff", on the requests and on their approval flow, and the
//     SPV/Manager HR and Director stages are added.
// recruitment_candidates gets its new columns (request link, company, division,
// level, phone number, email, HR interview meeting room and link).
// 2026-11-18 (docs/recruitment-requirement.md):
//   - requests get request_no, current_division_member, hard_skill, soft_skill,
//     other_requirement, salary_min and salary_max; an old job_requirement moves to
//     other_requirement;
//   - the SPV/Manager HR stage is split: "request spv/manager hr" becomes
//     "request spv hr" (requests and their approval flow), "request manager hr" and
//     "returned to requester" are added;
//   - old requests with a company get REC-<initial>-MM-YYYY-0001 numbers in id order,
//     with the month and year they were created;
//   - candidates lose their approval: the status column is dropped (pending and
//     rejected candidates become plain candidates; the progress keeps the history)
//     and the "recruitment candidate" approval flows are deactivated; they get the
//     professional license columns.
// Safe to run more than once: every step checks the current schema first.
const { DataTypes, Op } = require("sequelize");
const { syncModel, models, db1, db2 } = require("../src/models");

const recruitmentModels = [
  "Level",
  "RecruitmentRequest",
  "RecruitmentRequestRevision",
  "RecruitmentCandidate",
  "RecruitmentHrInterview",
  "RecruitmentUserInterview",
  "RecruitmentOffering",
  "RecruitmentContract",
  "RecruitmentVerificationProgress",
];

async function addMissingColumns(model) {
  const queryInterface = model.sequelize.getQueryInterface();
  const table = model.getTableName();
  const existing = await queryInterface.describeTable(table);
  for (const attribute of Object.values(model.rawAttributes)) {
    if (existing[attribute.field]) continue;
    // Foreign keys get a short explicit name: Sequelize's generated one can exceed
    // MySQL's 64-character identifier limit.
    const { references, ...definition } = attribute;
    await queryInterface.addColumn(table, attribute.field, definition);
    if (references)
      await queryInterface.addConstraint(table, {
        type: "foreign key",
        name: `fk_${table}_${attribute.field}`.slice(0, 64),
        fields: [attribute.field],
        references: { table: references.model, field: references.key },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      });
    console.log(`  + ${table}.${attribute.field}`);
  }
}

async function migrateRequests(name, dbModels) {
  console.log(`[${name}] recruitment_requests`);
  const model = dbModels.RecruitmentRequest;
  const queryInterface = model.sequelize.getQueryInterface();
  const table = "recruitment_requests";
  let columns = await queryInterface.describeTable(table);
  if (columns.job_recruitment && !columns.job_requirement) {
    await queryInterface.renameColumn(table, "job_recruitment", "job_requirement");
    console.log("  ~ job_recruitment renamed to job_requirement");
  }
  if (columns.job_title && !columns.job_title.allowNull) {
    const { job_title: jobTitle } = model.rawAttributes;
    await queryInterface.changeColumn(table, "job_title", {
      type: jobTitle.type,
      allowNull: true,
      comment: jobTitle.comment,
    });
    console.log("  ~ job_title is now nullable");
  }
  await addMissingColumns(model);
  columns = await queryInterface.describeTable(table);
  const { status } = model.rawAttributes;
  const statusColumn = (values) => ({
    type: DataTypes.ENUM(...values),
    allowNull: status.allowNull,
    defaultValue: status.defaultValue,
  });
  if (!columns.status.type.toLowerCase().includes("request hr staff")) {
    // Widen first so both names are valid while the rows are renamed.
    await queryInterface.changeColumn(table, "status", statusColumn([...status.values, "pending"]));
    const [result] = await model.sequelize.query(
      `UPDATE ${table} SET status = 'request hr staff' WHERE status = 'pending'`,
    );
    await queryInterface.changeColumn(table, "status", statusColumn(status.values));
    console.log(`  ~ status: pending renamed to request hr staff (${result.affectedRows} requests), stages added`);
  }
  const [flows] = await model.sequelize.query(`UPDATE approval_flows SET status = 'request hr staff'
    WHERE approval_for = 'recruitment request' AND status = 'pending'`);
  if (flows.affectedRows)
    console.log(`  ~ approval_flows: recruitment request pending renamed to request hr staff (${flows.affectedRows})`);

  // SPV/Manager HR split into SPV HR and Manager HR (2026-11-18).
  columns = await queryInterface.describeTable(table);
  if (!columns.status.type.toLowerCase().includes("request manager hr")) {
    const oldStage = "request spv/manager hr";
    await queryInterface.changeColumn(table, "status", statusColumn([...status.values, oldStage]));
    const [result] = await model.sequelize.query(
      `UPDATE ${table} SET status = 'request spv hr' WHERE status = '${oldStage}'`,
    );
    await queryInterface.changeColumn(table, "status", statusColumn(status.values));
    console.log(`  ~ status: ${oldStage} renamed to request spv hr (${result.affectedRows} requests), manager hr and returned to requester added`);
  }
  const [split] = await model.sequelize.query(`UPDATE approval_flows SET status = 'request spv hr'
    WHERE approval_for = 'recruitment request' AND status = 'request spv/manager hr'`);
  if (split.affectedRows)
    console.log(`  ~ approval_flows: recruitment request spv/manager hr renamed to request spv hr (${split.affectedRows})`);

  const [moved] = await model.sequelize.query(`UPDATE ${table} SET other_requirement = job_requirement
    WHERE other_requirement IS NULL AND job_requirement IS NOT NULL`);
  if (moved.affectedRows) console.log(`  ~ job_requirement copied to other_requirement (${moved.affectedRows})`);
}

// Candidates have no approval since 2026-11-18.
async function migrateCandidates(name, dbModels) {
  console.log(`[${name}] recruitment_candidates`);
  const model = dbModels.RecruitmentCandidate;
  await addMissingColumns(model);
  const queryInterface = model.sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable("recruitment_candidates");
  if (columns.status) {
    await queryInterface.removeColumn("recruitment_candidates", "status");
    console.log("  - status (candidates have no approval)");
  }
  const [flows] = await model.sequelize.query(`UPDATE approval_flows SET is_active = false
    WHERE approval_for = 'recruitment candidate' AND is_active = true`);
  if (flows.affectedRows)
    console.log(`  ~ approval_flows: recruitment candidate deactivated (${flows.affectedRows})`);
}

// Old requests with a company get a number: per company initial and year, in id
// order, after the highest number already given. Both databases get the same number.
async function numberRequests() {
  const rows = await models.db1.RecruitmentRequest.findAll({
    attributes: ["id", "id_company", "request_no", "createdAt"],
    where: { request_no: null, id_company: { [Op.ne]: null } },
    order: [["id", "ASC"]],
    raw: true,
  });
  const companies = new Map(
    (await models.db1.Company.findAll({ attributes: ["id", "initial_company"], raw: true }))
      .map((company) => [company.id, String(company.initial_company || "").trim().toUpperCase()]),
  );
  const lastByPrefix = new Map();
  let numbered = 0;
  for (const row of rows) {
    const initial = companies.get(row.id_company);
    if (!initial) continue;
    const created = new Date(row.createdAt);
    const year = created.getFullYear();
    const month = String(created.getMonth() + 1).padStart(2, "0");
    const key = `${initial}|${year}`;
    if (!lastByPrefix.has(key)) {
      const existing = await models.db1.RecruitmentRequest.findAll({
        attributes: ["request_no"],
        where: { request_no: { [Op.like]: `REC-${initial}-__-${year}-%` } },
        raw: true,
      });
      lastByPrefix.set(key, Math.max(0, ...existing.map((item) => Number(item.request_no.split("-").pop()) || 0)));
    }
    const sequence = lastByPrefix.get(key) + 1;
    lastByPrefix.set(key, sequence);
    const requestNo = `REC-${initial}-${month}-${year}-${String(sequence).padStart(4, "0")}`;
    for (const dbModels of [models.db1, models.db2])
      await dbModels.RecruitmentRequest.update({ request_no: requestNo }, { where: { id: row.id, request_no: null } });
    numbered++;
  }
  const missing = await models.db1.RecruitmentRequest.count({ where: { request_no: null } });
  console.log(`[db1/db2] requests numbered: ${numbered}${missing ? `; ${missing} without a company keep no number` : ""}`);
}

const tableExists = (model) => model.sequelize.getQueryInterface().tableExists(model.getTableName());

const run = async () => {
  try {
    // levels first: new request and candidate columns reference it.
    await syncModel("Level", "both", {});
    // Existing tables get their new columns before sync: sync also adds the model's
    // indexes and fails on an index column that does not exist yet.
    for (const [name, dbModels] of [["db1", models.db1], ["db2", models.db2]]) {
      if (await tableExists(dbModels.RecruitmentRequest)) await migrateRequests(name, dbModels);
      if (await tableExists(dbModels.RecruitmentCandidate)) await migrateCandidates(name, dbModels);
    }
    for (const modelName of recruitmentModels) await syncModel(modelName, "both", {});
    await numberRequests();
    console.log("Recruitment tables synchronized successfully");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
