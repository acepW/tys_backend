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
// Safe to run more than once: every step checks the current schema first.
const { DataTypes } = require("sequelize");
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
      if (await tableExists(dbModels.RecruitmentCandidate)) {
        console.log(`[${name}] recruitment_candidates`);
        await addMissingColumns(dbModels.RecruitmentCandidate);
      }
    }
    for (const modelName of recruitmentModels) await syncModel(modelName, "both", {});
    console.log("Recruitment tables synchronized successfully");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
