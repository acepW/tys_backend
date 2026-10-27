// Adds leave_requests.sick_letter_status and the "request doctor letter" /
// "request verification hr" statuses. Safe to run more than once.
// sick_letter_status moved from HR approval to create, with new values:
//   attached -> doctor letter, not attached -> referral letter.
// Requests already waiting in "request verification hr" under the old flow have no
// doctor's letter yet (HR used to upload it there), so they go back to
// "request doctor letter" for the requester to upload it.
const { DataTypes } = require("sequelize");
const { models, db1, db2 } = require("../src/models");

const oldValues = { attached: "doctor letter", "not attached": "referral letter" };

const run = async () => {
  try {
    for (const [name, dbModels] of [["db1", models.db1], ["db2", models.db2]]) {
      const model = dbModels.LeaveRequest;
      const queryInterface = model.sequelize.getQueryInterface();
      const columns = await queryInterface.describeTable("leave_requests");
      const { sick_letter_status: sickLetter, status } = model.rawAttributes;
      if (!columns.status.type.toLowerCase().includes("request doctor letter")) {
        await queryInterface.changeColumn("leave_requests", "status", {
          type: status.type,
          allowNull: status.allowNull,
          defaultValue: status.defaultValue,
        });
        console.log(`[${name}] ~ leave_requests.status adds "request doctor letter", "request verification hr"`);
      }
      const column = (values) => ({
        type: DataTypes.ENUM(...values),
        allowNull: sickLetter.allowNull,
        comment: sickLetter.comment,
      });
      if (!columns.sick_letter_status) {
        await queryInterface.addColumn("leave_requests", "sick_letter_status", column(sickLetter.values));
        console.log(`[${name}] + leave_requests.sick_letter_status`);
      } else if (columns.sick_letter_status.type.toLowerCase().includes("not attached")) {
        await queryInterface.changeColumn("leave_requests", "sick_letter_status",
          column([...sickLetter.values, ...Object.keys(oldValues)]));
        const [moved] = await model.sequelize.query(`UPDATE leave_requests
          SET status = 'request doctor letter' WHERE status = 'request verification hr'`);
        for (const [oldValue, newValue] of Object.entries(oldValues))
          await model.sequelize.query(
            "UPDATE leave_requests SET sick_letter_status = ? WHERE sick_letter_status = ?",
            { replacements: [newValue, oldValue] },
          );
        await queryInterface.changeColumn("leave_requests", "sick_letter_status", column(sickLetter.values));
        console.log(`[${name}] ~ sick_letter_status values renamed; ${moved.affectedRows} requests moved back to "request doctor letter"`);
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
