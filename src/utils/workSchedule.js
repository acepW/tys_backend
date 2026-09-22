const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const normalizeTime = (value) => {
  const match = TIME_PATTERN.exec(String(value || "").trim());
  if (!match) return null;
  return `${match[1]}:${match[2]}:${match[3] || "00"}`;
};

const isSameDayWorkPeriod = (checkInTime, checkOutTime) => {
  const checkIn = normalizeTime(checkInTime);
  const checkOut = normalizeTime(checkOutTime);
  return Boolean(checkIn && checkOut && checkOut > checkIn);
};

const previousDate = (dateOnly) => {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

module.exports = { normalizeTime, isSameDayWorkPeriod, previousDate };
