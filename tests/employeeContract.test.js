const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isValidDateOnly,
  calculateContractReminderDate,
} = require("../src/utils/employeeContract");

test("calculates the employee contract reminder 60 days before expiry", () => {
  assert.equal(calculateContractReminderDate("2026-12-31", 60), "2026-11-01");
});

test("supports a configurable contract reminder period", () => {
  assert.equal(calculateContractReminderDate("2028-03-01", 30), "2028-01-31");
  assert.equal(calculateContractReminderDate(null, 60), null);
});

test("validates date-only contract values", () => {
  assert.equal(isValidDateOnly("2026-02-28"), true);
  assert.equal(isValidDateOnly("2026-02-29"), false);
  assert.equal(isValidDateOnly("28-02-2026"), false);
});
