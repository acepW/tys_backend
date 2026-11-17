// Adds customers.id_company and customers.customer_code (2026-11-18).
// Safe to run more than once:
//   1. Adds both columns, nullable at first.
//   2. Existing customers without a company get the company with initial TYS, and
//      customers without a code get C-TYS-<YYYY>-<MM><sequence>, in id order,
//      with the year and month of their createdAt. The sequence continues after
//      the highest TYS code already given. A customer keeps a code it already
//      has in either database, so both databases end up with the same code.
//   3. Makes both columns NOT NULL and customer_code unique.
const { fn, col, where, Op } = require("sequelize");
const { models, db1, db2 } = require("../src/models");
const { formatCustomerCode, highestCustomerSequence } = require("../src/utils/customerCode");

const LEGACY_INITIAL = "TYS";
const databases = [["db1", models.db1], ["db2", models.db2]];

async function addNullableColumn(name, model, column) {
  const queryInterface = model.sequelize.getQueryInterface();
  const existing = await queryInterface.describeTable("customers");
  if (existing[column]) return;
  await queryInterface.addColumn("customers", column, {
    ...model.rawAttributes[column],
    allowNull: true,
  });
  console.log(`[${name}] + customers.${column}`);
}

async function backfill() {
  const company = await models.db1.Company.findOne({
    where: where(fn("UPPER", col("initial_company")), LEGACY_INITIAL),
    attributes: ["id"],
  });
  if (!company) throw new Error(`No company with initial ${LEGACY_INITIAL} for existing customers`);
  if (!(await models.db2.Company.findByPk(company.id)))
    throw new Error(`Company ${company.id} (${LEGACY_INITIAL}) is missing from db2`);

  const rows = new Map(); // id -> { createdAt, code }
  const codes = [];
  for (const [, dbModels] of databases) {
    const customers = await dbModels.Customer.findAll({
      attributes: ["id", "customer_code", "id_company", "createdAt"],
      raw: true,
    });
    for (const customer of customers) {
      if (customer.customer_code) codes.push(customer.customer_code);
      const row = rows.get(customer.id) || { createdAt: customer.createdAt, code: null, missing: false };
      row.code = row.code || customer.customer_code;
      row.missing = row.missing || !customer.customer_code || !customer.id_company;
      rows.set(customer.id, row);
    }
  }

  let sequence = highestCustomerSequence(LEGACY_INITIAL, codes);
  let coded = 0;
  for (const [id, row] of [...rows].sort(([a], [b]) => a - b)) {
    if (!row.missing) continue;
    if (!row.code) {
      sequence += 1n;
      row.code = formatCustomerCode(LEGACY_INITIAL, sequence, new Date(row.createdAt)).customer_code;
      coded++;
    }
    for (const [, dbModels] of databases) {
      await dbModels.Customer.update(
        { customer_code: row.code },
        { where: { id, customer_code: null } },
      );
      await dbModels.Customer.update(
        { id_company: company.id },
        { where: { id, id_company: null } },
      );
    }
  }
  console.log(`[db1/db2] customers given a ${LEGACY_INITIAL} code: ${coded}`);
}

async function finalize(name, model) {
  const queryInterface = model.sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable("customers");
  for (const column of ["id_company", "customer_code"]) {
    if (!columns[column].allowNull) continue;
    const attribute = model.rawAttributes[column];
    // The foreign key was added with the column; only the nullability changes.
    await queryInterface.changeColumn("customers", column, {
      type: attribute.type,
      allowNull: false,
      comment: attribute.comment,
    });
    console.log(`[${name}] ~ customers.${column} NOT NULL`);
  }
  const indexes = (await queryInterface.showIndex("customers")).map((index) => index.name);
  for (const index of model.options.indexes.filter((item) =>
    ["uq_customer_code", "idx_customer_company"].includes(item.name))) {
    if (indexes.includes(index.name)) continue;
    await queryInterface.addIndex("customers", index.fields, { name: index.name, unique: !!index.unique });
    console.log(`[${name}] + index ${index.name}`);
  }
}

const run = async () => {
  try {
    for (const [name, dbModels] of databases) {
      await addNullableColumn(name, dbModels.Customer, "id_company");
      await addNullableColumn(name, dbModels.Customer, "customer_code");
    }
    await backfill();
    for (const [name, dbModels] of databases) await finalize(name, dbModels.Customer);
    const missing = await models.db1.Customer.count({
      where: { [Op.or]: [{ customer_code: null }, { id_company: null }] },
    });
    if (missing) throw new Error(`${missing} customers still have no code or company`);
    console.log("Customer code synchronized successfully");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
