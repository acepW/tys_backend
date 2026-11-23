// Customer code: C-<company initial>-<YYYY>-<MM><sequence>, e.g. C-TYSCS-2026-1100001.
// Year and month are when the customer is created (Asia/Jakarta). The sequence
// is per company initial and never resets: it continues across months and years,
// padded to five digits and growing past 99999. Older codes with a three-digit
// sequence (e.g. C-TYS-2026-11042) are still read, so the sequence carries on.
const jakartaYearMonth = (date) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return { year: parts.year, month: parts.month };
};

const normalizeInitial = (initialCompany) =>
  String(initialCompany || "-").trim().toUpperCase();

// Highest sequence among the codes of this initial; other initials and
// malformed codes are ignored.
const highestCustomerSequence = (initialCompany, customerCodes = []) => {
  const prefix = `C-${normalizeInitial(initialCompany)}-`;
  let highest = 0n;
  for (const code of customerCodes) {
    const normalized = String(code || "").trim().toUpperCase();
    if (!normalized.startsWith(prefix)) continue;
    const match = /^\d{4}-\d{2}(\d{3,})$/.exec(normalized.slice(prefix.length));
    if (!match) continue;
    const sequence = BigInt(match[1]);
    if (sequence > highest) highest = sequence;
  }
  return highest;
};

const formatCustomerCode = (initialCompany, sequence, date = new Date()) => {
  const { year, month } = jakartaYearMonth(date);
  const number = String(sequence).padStart(5, "0");
  return {
    next_number: number,
    customer_code: `C-${normalizeInitial(initialCompany)}-${year}-${month}${number}`,
  };
};

const getNextCustomerCode = (initialCompany, customerCodes = [], date = new Date()) =>
  formatCustomerCode(
    initialCompany,
    highestCustomerSequence(initialCompany, customerCodes) + 1n,
    date,
  );

module.exports = { getNextCustomerCode, formatCustomerCode, highestCustomerSequence };
