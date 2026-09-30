const getNextEmployeeCode = (initialCompany, employeeCodes = [], date = new Date()) => {
  const initial = String(initialCompany || "-").trim().toUpperCase();
  const dateParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      year: "2-digit",
      month: "2-digit",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  let highestNumber = 0n;

  for (const code of employeeCodes) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    if (!normalizedCode.startsWith(initial)) continue;
    const suffix = normalizedCode.slice(initial.length);
    const match = /^\d{4}(\d{4,})$/.exec(suffix);
    if (!match) continue;
    const number = BigInt(match[1]);
    if (number > highestNumber) highestNumber = number;
  }

  const nextNumber = String(highestNumber + 1n).padStart(4, "0");
  return {
    next_number: nextNumber,
    employee_code: `${initial}${dateParts.year}${dateParts.month}${nextNumber}`,
  };
};

module.exports = { getNextEmployeeCode };
