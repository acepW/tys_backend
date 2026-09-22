const { syncModel, db1, db2 } = require("../src/models");

const hrModels = ["Holiday"];

const run = async () => {
  try {
    for (const modelName of hrModels) {
      await syncModel(modelName, "both", {});
    }
    console.log("HR tables synchronized successfully");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
