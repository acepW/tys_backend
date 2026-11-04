// Adds leave_requests.start_time, end_time, total_hours and hr_decision_type.
// Safe to run more than once: existing columns are left untouched. Requests
// created before this keep them NULL.
const { models, db1, db2 } = require("../src/models");

async function addColumn(model, column) {
  const queryInterface = model.sequelize.getQueryInterface();
  const table = model.getTableName();
  const existing = await queryInterface.describeTable(table);
  if (existing[column]) return;
  await queryInterface.addColumn(table, column, model.rawAttributes[column]);
  console.log(`  + ${table}.${column}`);
}

const run = async () => {
  try {
    for (const [name, dbModels] of [["db1", models.db1], ["db2", models.db2]]) {
      console.log(`[${name}]`);
      for (const column of ["start_time", "end_time", "total_hours", "hr_decision_type"])
        await addColumn(dbModels.LeaveRequest, column);
    }
    console.log("Leave request fields synchronized successfully");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
