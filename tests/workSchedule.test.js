const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeTime,
  isSameDayWorkPeriod,
  previousDate,
} = require("../src/utils/workSchedule");

test("normalizes work schedule times", () => {
  assert.equal(normalizeTime("08:30"), "08:30:00");
  assert.equal(normalizeTime("17:15:45"), "17:15:45");
});

test("rejects invalid work schedule times", () => {
  assert.equal(normalizeTime("24:00"), null);
  assert.equal(normalizeTime("08:60"), null);
  assert.equal(normalizeTime("8:00"), null);
});

test("requires check-out after check-in for a same-day schedule", () => {
  assert.equal(isSameDayWorkPeriod("08:00", "17:00"), true);
  assert.equal(isSameDayWorkPeriod("17:00", "08:00"), false);
  assert.equal(isSameDayWorkPeriod("08:00", "08:00"), false);
});

test("calculates the prior schedule end date", () => {
  assert.equal(previousDate("2026-10-01"), "2026-09-30");
  assert.equal(previousDate("2028-03-01"), "2028-02-29");
});
