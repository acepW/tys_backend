const { syncModel, db1, db2 } = require("../src/models");

const run = async () => {
  try {
    await syncModel("Employee", "both", { alter: true });
    await syncModel("EmployeeEmergencyContact", "both", {});
    console.log("Employee profile tables synchronized successfully");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
