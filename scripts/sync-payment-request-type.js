// Adds "top up petty cash" to payment_requests.payment_type and request_format.
// Only widens the ENUMs, so existing rows are untouched and it is safe to run more than once.
const { models, db1, db2 } = require("../src/models");

async function syncEnum(model, column) {
  const table = model.getTableName();
  await model.sequelize.getQueryInterface().changeColumn(table, column, model.rawAttributes[column]);
  console.log(`  ~ ${table}.${column}`);
}

const run = async () => {
  try {
    for (const [name, dbModels] of [["db1", models.db1], ["db2", models.db2]]) {
      console.log(`[${name}]`);
      for (const column of ["payment_type", "request_format"])
        await syncEnum(dbModels.PaymentRequest, column);
    }
    console.log("Payment request type synchronized successfully");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
