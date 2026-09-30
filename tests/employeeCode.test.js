const test = require("node:test");
const assert = require("node:assert/strict");
const { getNextEmployeeCode } = require("../src/utils/employeeCode");
const employeeService = require("../src/services/humanResource/employee.service");
const { models } = require("../src/models");

test("employee code uses company initials, Jakarta year and month, and a four-digit sequence", () => {
  assert.deepEqual(
    getNextEmployeeCode("tyscg", ["TYSCG26090050"], new Date("2026-09-30T00:00:00Z")),
    { next_number: "0051", employee_code: "TYSCG26090051" },
  );
});

test("employee sequence continues across months and years", () => {
  assert.deepEqual(
    getNextEmployeeCode(
      "TYSCG",
      ["TYSCG25090049", "TYSCG26080051", "TYSCG26090050"],
      new Date("2027-01-01T00:00:00Z"),
    ),
    { next_number: "0052", employee_code: "TYSCG27010052" },
  );
});

test("employee sequence ignores other companies and malformed codes", () => {
  assert.deepEqual(
    getNextEmployeeCode(
      "TYSCG",
      ["OTHER26090099", "TYSCG-26090099", "TYSCG2609005X", "TYSCG26090002"],
      new Date("2026-09-30T00:00:00Z"),
    ),
    { next_number: "0003", employee_code: "TYSCG26090003" },
  );
});

test("employee sequence starts at 0001 and continues beyond four digits", () => {
  const date = new Date("2026-09-30T00:00:00Z");
  assert.equal(getNextEmployeeCode("TYSCG", [], date).employee_code, "TYSCG26090001");
  assert.equal(
    getNextEmployeeCode("TYSCG", ["TYSCG25099999"], date).employee_code,
    "TYSCG260910000",
  );
});

test("next employee codes are calculated separately for each company without an active filter", async (t) => {
  const originalCompanies = models.db1.Company.findAll;
  const originalEmployees = models.db1.Employee.findAll;
  t.after(() => {
    models.db1.Company.findAll = originalCompanies;
    models.db1.Employee.findAll = originalEmployees;
  });
  models.db1.Company.findAll = async () => [
    { id: 1, company_name: "TYS", initial_company: "tyscg" },
    { id: 2, company_name: "Other", initial_company: "oth" },
  ];
  models.db1.Employee.findAll = async (options) => {
    assert.equal(options.where, undefined);
    return [
      { id_company: 1, employee_code: "TYSCG25090050" },
      { id_company: 2, employee_code: "OTH26090007" },
    ];
  };

  const result = await employeeService.getNextEmployeeCodes();
  assert.equal(result[0].next_number, "0051");
  assert.match(result[0].employee_code, /^TYSCG\d{4}0051$/);
  assert.equal(result[1].next_number, "0008");
  assert.match(result[1].employee_code, /^OTH\d{4}0008$/);
});
