const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

const pad = (value) => String(value).padStart(2, "0");

const formatDateOnly = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const isValidDateOnly = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const normalizeYear = (value) => {
  if (value === null || value === undefined || value === "") return null;

  const year = Number(value);
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    return null;
  }

  return year;
};

const generateWeekendHolidays = (year) => {
  const normalizedYear = normalizeYear(year);
  if (normalizedYear === null) {
    throw new RangeError(`year must be an integer between ${MIN_YEAR} and ${MAX_YEAR}`);
  }

  const holidays = [];
  const date = new Date(Date.UTC(normalizedYear, 0, 1));

  while (date.getUTCFullYear() === normalizedYear) {
    const day = date.getUTCDay();
    if (day === 6) {
      holidays.push({ holiday_date: formatDateOnly(date), title: "Libur Sabtu" });
    } else if (day === 0) {
      holidays.push({ holiday_date: formatDateOnly(date), title: "Libur Minggu" });
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return holidays;
};

module.exports = {
  MAX_YEAR,
  MIN_YEAR,
  generateWeekendHolidays,
  isValidDateOnly,
  normalizeYear,
};
