const test = require("node:test");
const assert = require("node:assert/strict");
const {
  generateWeekendHolidays,
  isValidDateOnly,
  normalizeYear,
} = require("../src/utils/holidayCalendar");

test("generates every Saturday and Sunday for a selected year", () => {
  const holidays = generateWeekendHolidays(2026);

  assert.equal(holidays.length, 104);
  assert.deepEqual(holidays[0], {
    holiday_date: "2026-01-03",
    title: "Libur Sabtu",
  });
  assert.deepEqual(holidays[1], {
    holiday_date: "2026-01-04",
    title: "Libur Minggu",
  });
  assert.deepEqual(holidays.at(-1), {
    holiday_date: "2026-12-27",
    title: "Libur Minggu",
  });
});

test("handles a leap year without leaking into another year", () => {
  const holidays = generateWeekendHolidays(2028);

  assert.equal(holidays.length, 106);
  assert.ok(holidays.every((item) => item.holiday_date.startsWith("2028-")));
});

test("validates date-only values and supported years", () => {
  assert.equal(isValidDateOnly("2026-09-22"), true);
  assert.equal(isValidDateOnly("2026-02-29"), false);
  assert.equal(isValidDateOnly("22-09-2026"), false);
  assert.equal(normalizeYear("2026"), 2026);
  assert.equal(normalizeYear("2026.5"), null);
  assert.equal(normalizeYear(2200), null);
});
