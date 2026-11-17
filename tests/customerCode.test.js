const test = require("node:test");
const assert = require("node:assert/strict");
const { getNextCustomerCode, formatCustomerCode } = require("../src/utils/customerCode");
const customerService = require("../src/services/customer.service");
const fileService = require("../src/services/file.service");
const { models, db1 } = require("../src/models");

test("customer code uses C, the company initial, the Jakarta year and month, and a three-digit sequence", () => {
  assert.deepEqual(
    getNextCustomerCode("tyscs", ["C-TYSCS-2026-11004"], new Date("2026-11-18T00:00:00Z")),
    { next_number: "005", customer_code: "C-TYSCS-2026-11005" },
  );
  // 31 Oct 20:00 UTC is already November in Jakarta.
  assert.equal(
    getNextCustomerCode("TYSCS", [], new Date("2026-10-31T20:00:00Z")).customer_code,
    "C-TYSCS-2026-11001",
  );
});

test("customer sequence never resets across months and years", () => {
  assert.equal(
    getNextCustomerCode("TYSCS",
      ["C-TYSCS-2025-12041", "C-TYSCS-2026-01042", "C-TYSCS-2026-11007"],
      new Date("2027-01-05T00:00:00Z")).customer_code,
    "C-TYSCS-2027-01043",
  );
});

test("customer sequence is per company initial and ignores malformed codes", () => {
  assert.equal(
    getNextCustomerCode("TYS",
      ["C-TYSCS-2026-11099", "C-TYS-2026-1X003", "C-TYS-26-11050", "C-TYS-2026-11002"],
      new Date("2026-11-18T00:00:00Z")).customer_code,
    "C-TYS-2026-11003",
  );
});

test("customer sequence grows past 999", () => {
  assert.equal(
    getNextCustomerCode("TYS", ["C-TYS-2026-10999"], new Date("2026-11-18T00:00:00Z")).customer_code,
    "C-TYS-2026-111000",
  );
  assert.equal(formatCustomerCode("TYS", 7n, new Date("2026-03-01T00:00:00Z")).customer_code, "C-TYS-2026-03007");
});

// Single-database create against in-memory rows.
function mockCreate(t, { companies, customers }) {
  const { Company, Customer } = models.db1;
  const originals = [[Company, "findOne"], [Customer, "findAll"], [Customer, "create"], [db1, "transaction"],
    [fileService, "syncFiles"]].map(([target, key]) => [target, key, target[key]]);
  t.after(() => { for (const [target, key, value] of originals) target[key] = value; });
  const state = { customers: [...customers], lookups: [] };
  Company.findOne = async ({ where }) => companies.find((row) => row.id === where.id && row.is_active) ?? null;
  Customer.findAll = async (options) => {
    state.lookups.push(options);
    return state.customers.map((customer_code) => ({ customer_code }));
  };
  Customer.create = async (data) => ({ id: 1, ...data, toJSON() { return { id: 1, ...data }; } });
  db1.transaction = async () => ({ LOCK: { UPDATE: "UPDATE" }, commit: async () => {}, rollback: async () => {} });
  fileService.syncFiles = async () => {};
  return state;
}

test("creating a customer assigns the next code of its company and ignores a code in the body", async (t) => {
  const state = mockCreate(t, {
    companies: [{ id: 3, initial_company: "tyscs", is_active: true }],
    customers: ["C-TYSCS-2025-12041"],
  });
  const customer = await customerService.createWithRelations(
    { customer_type: "company", company_name_indo: "PT A", id_company: "3", customer_code: "C-X-2026-11999" },
    7, false);
  assert.equal(customer.id_company, 3);
  assert.match(customer.customer_code, /^C-TYSCS-\d{4}-\d{2}042$/);
  // Read under lock, only the codes of this initial.
  assert.equal(state.lookups[0].lock, "UPDATE");
  assert.match(String(state.lookups[0].where.customer_code[Object.getOwnPropertySymbols(
    state.lookups[0].where.customer_code)[0]]), /^C-TYSCS-%$/);
});

test("creating a customer needs an active company with an initial", async (t) => {
  mockCreate(t, {
    companies: [{ id: 3, initial_company: "TYSCS", is_active: false }, { id: 4, initial_company: " ", is_active: true }],
    customers: [],
  });
  const create = (id_company) => customerService.createWithRelations({ customer_type: "company", id_company }, 7, false);
  await assert.rejects(create(undefined), (error) => error.statusCode === 400 && /id_company is required/.test(error.message));
  await assert.rejects(create(3), (error) => error.statusCode === 404 && /Company not found/.test(error.message));
  await assert.rejects(create(4), (error) => error.statusCode === 400 && /has no initial/.test(error.message));
});

test("editing a customer cannot change its company or code", () => {
  const data = customerService._buildCustomerData({ company_name_indo: "PT B", id_company: 9, customer_code: "C-X" }, true);
  assert.deepEqual(data, { company_name_indo: "PT B" });
});
