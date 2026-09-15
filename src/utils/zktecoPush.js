const crypto = require("crypto");

const PUNCH_TYPES = {
  0: "check_in",
  1: "check_out",
  2: "break_out",
  3: "break_in",
  4: "overtime_in",
  5: "overtime_out",
};

const mapPunchType = (state) => PUNCH_TYPES[Number(state)] || "unknown";

const normalizeBody = (body) => {
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return "";
  return Object.entries(body)
    .map(([key, value]) => (value === "" ? key : `${key}=${value}`))
    .join("\n");
};

const parseTimestamp = (value, timezoneOffset = "+07:00") => {
  const normalized = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return null;
  }

  const date = new Date(`${normalized.replace(" ", "T")}${timezoneOffset}`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseAttendanceLine = (
  line,
  serialNumber,
  timezoneOffset = "+07:00",
) => {
  const rawPayload = String(line || "").trim();
  if (!rawPayload) return null;

  const usesTabs = rawPayload.includes("\t");
  const fields = usesTabs ? rawPayload.split("\t") : rawPayload.split(/\s+/);
  if (fields.length < 3) return null;

  const deviceUserId = String(fields[0] || "").trim();
  const timestamp = usesTabs ? fields[1] : `${fields[1]} ${fields[2]}`;
  const punchStateIndex = usesTabs ? 2 : 3;
  const verifyModeIndex = usesTabs ? 3 : 4;
  const workCodeIndex = usesTabs ? 4 : 5;
  const occurredAt = parseTimestamp(timestamp, timezoneOffset);
  if (!deviceUserId || !occurredAt) return null;

  const punchStateValue = fields[punchStateIndex];
  const verifyModeValue = fields[verifyModeIndex];
  const punchState = Number.isInteger(Number(punchStateValue))
    ? Number(punchStateValue)
    : null;
  const verifyMode = Number.isInteger(Number(verifyModeValue))
    ? Number(verifyModeValue)
    : null;
  const workCode = fields[workCodeIndex]
    ? String(fields[workCodeIndex]).trim()
    : null;
  const attendanceDate = timestamp.slice(0, 10);
  const normalizedEvent = [
    serialNumber,
    deviceUserId,
    timestamp,
    punchState ?? "",
    verifyMode ?? "",
    workCode || "",
  ].join("|");

  return {
    deviceUserId,
    attendanceDate,
    occurredAt,
    punchState,
    punchType: mapPunchType(punchState),
    verifyMode,
    workCode,
    rawPayload,
    eventKey: crypto.createHash("sha256").update(normalizedEvent).digest("hex"),
  };
};

const parseAttendancePayload = (
  body,
  serialNumber,
  timezoneOffset = "+07:00",
) => {
  const text = normalizeBody(body).replace(/^ATTLOG\s*/i, "");
  const events = [];
  const invalidLines = [];

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = parseAttendanceLine(line, serialNumber, timezoneOffset);
    if (event) events.push(event);
    else invalidLines.push(line);
  }

  return { events, invalidLines };
};

const summarizeAttendance = (logs) => {
  const sorted = [...logs].sort(
    (left, right) => new Date(left.occurred_at) - new Date(right.occurred_at),
  );
  const firstOf = (type) => sorted.find((log) => log.punch_type === type)?.occurred_at || null;
  const lastOf = (type) => {
    const matching = sorted.filter((log) => log.punch_type === type);
    return matching.length > 0 ? matching[matching.length - 1].occurred_at : null;
  };

  const checkInAt = firstOf("check_in");
  const checkOutAt = lastOf("check_out");
  const breakOutAt = firstOf("break_out");
  const breakInAt = lastOf("break_in");
  let workMinutes = 0;

  if (checkInAt && checkOutAt && new Date(checkOutAt) >= new Date(checkInAt)) {
    workMinutes = Math.floor((new Date(checkOutAt) - new Date(checkInAt)) / 60000);
    if (breakOutAt && breakInAt && new Date(breakInAt) >= new Date(breakOutAt)) {
      workMinutes -= Math.floor((new Date(breakInAt) - new Date(breakOutAt)) / 60000);
    }
    workMinutes = Math.max(workMinutes, 0);
  }

  return {
    check_in_at: checkInAt,
    check_out_at: checkOutAt,
    break_out_at: breakOutAt,
    break_in_at: breakInAt,
    overtime_in_at: firstOf("overtime_in"),
    overtime_out_at: lastOf("overtime_out"),
    first_punch_at: sorted[0]?.occurred_at || null,
    last_punch_at: sorted[sorted.length - 1]?.occurred_at || null,
    work_minutes: workMinutes,
    status: checkInAt && checkOutAt ? "present" : "incomplete",
  };
};

module.exports = {
  mapPunchType,
  parseAttendanceLine,
  parseAttendancePayload,
  summarizeAttendance,
};
