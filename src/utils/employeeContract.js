const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isValidDateOnly = (value) => {
  if (value === null || value === undefined || value === "") return true;
  if (!DATE_ONLY_PATTERN.test(String(value))) return false;

  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const calculateContractReminderDate = (contractEndDate, reminderDays = 60) => {
  if (!contractEndDate) return null;
  if (!isValidDateOnly(contractEndDate)) return null;

  const days = Number(reminderDays);
  if (!Number.isInteger(days) || days < 0) return null;

  const date = new Date(`${contractEndDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};

module.exports = { isValidDateOnly, calculateContractReminderDate };
