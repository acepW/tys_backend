// Adds leave_requests.sick_letter_status and the "request verification hr" status.
// Safe to run more than once.
const { models, db1, db2 } = require("../src/models");

const run = async () => {
  try {
    for (const [name, dbModels] of [["db1", models.db1], ["db2", models.db2]]) {
      const model = dbModels.LeaveRequest;
      const queryInterface = model.sequelize.getQueryInterface();
      const columns = await queryInterface.describeTable("leave_requests");
      const { sick_letter_status: sickLetter, status } = model.rawAttributes;
      if (!columns.sick_letter_status) {
        await queryInterface.addColumn("leave_requests", "sick_letter_status", {
          type: sickLetter.type,
          allowNull: sickLetter.allowNull,
          comment: sickLetter.comment,
        });
        console.log(`[${name}] + leave_requests.sick_letter_status`);
      }
      if (!columns.status.type.toLowerCase().includes("request verification hr")) {
        await queryInterface.changeColumn("leave_requests", "status", {
          type: status.type,
          allowNull: status.allowNull,
          defaultValue: status.defaultValue,
        });
        console.log(`[${name}] ~ leave_requests.status adds "request verification hr"`);
      }
    }
    console.log("Leave request sick letter migration finished");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
