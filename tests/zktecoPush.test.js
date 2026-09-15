const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mapPunchType,
  parseAttendancePayload,
  summarizeAttendance,
} = require("../src/utils/zktecoPush");

test("maps ZKTeco attendance states", () => {
  assert.equal(mapPunchType(0), "check_in");
  assert.equal(mapPunchType(1), "check_out");
  assert.equal(mapPunchType(2), "break_out");
  assert.equal(mapPunchType(3), "break_in");
  assert.equal(mapPunchType(4), "overtime_in");
  assert.equal(mapPunchType(5), "overtime_out");
  assert.equal(mapPunchType(99), "unknown");
});

test("parses tab-separated ATTLOG payload and creates stable event keys", () => {
  const body = "1001\t2026-09-16 08:01:02\t0\t15\t0\t0";
  const first = parseAttendancePayload(body, "SF2A001", "+07:00");
  const repeated = parseAttendancePayload(body, "SF2A001", "+07:00");

  assert.equal(first.events.length, 1);
  assert.equal(first.invalidLines.length, 0);
  assert.equal(first.events[0].punchType, "check_in");
  assert.equal(first.events[0].attendanceDate, "2026-09-16");
  assert.equal(first.events[0].eventKey, repeated.events[0].eventKey);
});

test("rebuilds a daily summary when offline logs arrive out of order", () => {
  const logs = [
    { occurred_at: new Date("2026-09-16T17:00:00+07:00"), punch_type: "check_out" },
    { occurred_at: new Date("2026-09-16T12:30:00+07:00"), punch_type: "break_in" },
    { occurred_at: new Date("2026-09-16T08:00:00+07:00"), punch_type: "check_in" },
    { occurred_at: new Date("2026-09-16T12:00:00+07:00"), punch_type: "break_out" },
  ];

  const summary = summarizeAttendance(logs);
  assert.equal(summary.status, "present");
  assert.equal(summary.work_minutes, 510);
  assert.equal(summary.first_punch_at, logs[2].occurred_at);
  assert.equal(summary.last_punch_at, logs[0].occurred_at);
});
