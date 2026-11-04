const test = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/services/humanResource/leaveRequest.service");
const controller = require("../src/controllers/humanResource/leaveRequest.controller");
const { models, db1 } = require("../src/models");

function response() {
  return {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return body; },
  };
}

function mockLeaveRequest(t, request) {
  const originals = {
    transaction: db1.transaction,
    findOne: models.db1.LeaveRequest.findOne,
    update: models.db1.LeaveRequest.update,
    progress: models.db1.LeaveRequestVerificationProgress.create,
    employee: models.db1.Employee.findByPk,
    getById: service.getById,
  };
  t.after(() => {
    db1.transaction = originals.transaction;
    models.db1.LeaveRequest.findOne = originals.findOne;
    models.db1.LeaveRequest.update = originals.update;
    models.db1.LeaveRequestVerificationProgress.create = originals.progress;
    models.db1.Employee.findByPk = originals.employee;
    service.getById = originals.getById;
  });
  const writes = [];
  db1.transaction = async () => ({ LOCK: { UPDATE: "UPDATE" }, commit: async () => {}, rollback: async () => {} });
  models.db1.LeaveRequest.findOne = async () => request;
  models.db1.LeaveRequest.update = async (data) => { writes.push(["request", data]); Object.assign(request, data); return [1]; };
  models.db1.LeaveRequestVerificationProgress.create = async (data) => { writes.push(["progress", data.status, data.note]); return {}; };
  models.db1.Employee.findByPk = async (id) => (Number(id) === 3 ? { id: 3, id_department: 4 } : null);
  service.getById = async () => request;
  return writes;
}

test("leave request goes through every approval stage in order", async (t) => {
  const request = { id: 1, status: "request supervisor", id_user_request: 5 };
  const writes = mockLeaveRequest(t, request);
  await assert.rejects(service.decide(1, "director", "approve", 9, null, false),
    /not allowed from status "request supervisor"/);
  for (const [stage, next] of [
    ["supervisor", "request hr"],
    ["hr", "request spv hr"],
    ["spv hr", "request manager hr"],
    ["manager hr", "request director"],
    ["director", "approved"],
  ]) {
    await service.decide(1, stage, "approve", 9, null, false);
    assert.equal(request.status, next);
  }
  assert.deepEqual(writes.filter(([kind]) => kind === "progress").map(([, status]) => status), [
    "approved supervisor", "approved hr", "approved spv hr", "approved manager hr", "approved director",
  ]);
  await assert.rejects(service.decide(1, "director", "approve", 9, null, false), /not allowed from status "approved"/);
});

test("leave request rejection needs a note and stops at that stage", async (t) => {
  const request = { id: 1, status: "request spv hr", id_user_request: 5 };
  const writes = mockLeaveRequest(t, request);
  await assert.rejects(service.decide(1, "spv hr", "reject", 9, { note: " " }, false), /note is required/);
  await assert.rejects(service.decide(1, "hr", "reject", 9, { note: "x" }, false), /not allowed from status "request spv hr"/);
  await service.decide(1, "spv hr", "reject", 9, { note: "Surat dokter tidak jelas" }, false);
  assert.equal(request.status, "rejected spv hr");
  assert.deepEqual(writes.at(-1), ["progress", "rejected spv hr", "Surat dokter tidak jelas"]);
});

test("only the creator can edit a leave request awaiting the supervisor", async (t) => {
  const request = { id: 1, status: "request supervisor", id_user_request: 5, start_date: "2026-10-14", end_date: "2026-10-15" };
  const writes = mockLeaveRequest(t, request);
  await assert.rejects(service.update(1, { reason: "x" }, 8, false), /Only the creator/);
  await assert.rejects(service.update(1, { end_date: "2026-10-13" }, 5, false), /end_date must not be before start_date/);
  await service.update(1, { end_date: "2026-10-17", id_employee: 3, status: "approved" }, 5, false);
  assert.deepEqual(writes[0], ["request", { id_employee: 3, end_date: "2026-10-17", duration: 4, id_department: 4 }]);
  assert.equal(request.status, "request supervisor");

  request.status = "request hr";
  await assert.rejects(service.update(1, { reason: "x" }, 5, false), /awaiting the supervisor/);
});

test("referral letter: after the director the requester uploads the doctor's letter, then HR only verifies", async (t) => {
  const request = { id: 1, type: "Sick Leave", status: "request hr", id_user_request: 5, sick_letter_status: "referral letter" };
  const writes = mockLeaveRequest(t, request);
  const originalFile = models.db1.File.create;
  t.after(() => { models.db1.File.create = originalFile; });
  const files = [];
  models.db1.File.create = async (data) => { files.push(data); return { id: 50 + files.length, ...data }; };
  const skd = { original_name: "skd.pdf", stored_name: "1-skd.pdf", url: "/files/1-skd.pdf", mime_type: "application/pdf", size: 10 };

  for (const stage of ["hr", "spv hr", "manager hr"]) await service.decide(1, stage, "approve", 9, {}, false);
  await assert.rejects(service.submitDoctorLetter(1, 5, { files_attachment: [skd] }, false),
    /not allowed from status "request director"/);
  await service.decide(1, "director", "approve", 9, {}, false);
  assert.equal(request.status, "request doctor letter");

  await assert.rejects(service.verifyHr(1, 9, { hr_decision_type: "Unpaid Leave" }, false),
    /not allowed from status "request doctor letter"/);
  await assert.rejects(service.submitDoctorLetter(1, 5, { files_attachment: [] }, false), /doctor's letter/);
  await assert.rejects(service.submitDoctorLetter(1, 8, { files_attachment: [skd] }, false), /Only the creator/);
  await service.submitDoctorLetter(1, 5, { files_attachment: [skd], note: "SKD dari rumah sakit" }, false);
  assert.equal(request.status, "request verification hr");
  assert.deepEqual(files.map((file) => [file.fileable_type, file.fileable_id, file.category, file.stored_name, file.indonesian_name, file.uploaded_by]),
    [["leave_requests", 1, "files_attachment", "1-skd.pdf", "skd.pdf", 5]]);

  await assert.rejects(service.verifyHr(1, 9, { note: "SKD valid" }, false),
    /hr_decision_type must be one of: Sick Leave, Unpaid Leave, Annual Leave/);
  await assert.rejects(service.verifyHr(1, 9, { hr_decision_type: "Sick" }, false), /hr_decision_type must be one of/);
  await service.verifyHr(1, 9, { note: "SKD valid", hr_decision_type: "Unpaid Leave", files_attachment: [skd] }, false);
  assert.equal(request.status, "approved");
  // HR's decision is stored beside the requested type, which stays unchanged.
  assert.deepEqual([request.type, request.hr_decision_type], ["Sick Leave", "Unpaid Leave"]);
  assert.equal(request.sick_letter_status, "referral letter");
  assert.equal(files.length, 1);
  assert.deepEqual(writes.filter(([kind]) => kind === "progress").slice(-2),
    [["progress", "doctor letter submitted", "SKD dari rumah sakit"], ["progress", "verified hr", "SKD valid"]]);
});

test("doctor letter, or no sick letter at all, ends at the director", async (t) => {
  for (const sickLetterStatus of ["doctor letter", null, undefined]) {
    const request = { id: 1, type: "Sick", status: "request hr", id_user_request: 5, sick_letter_status: sickLetterStatus };
    mockLeaveRequest(t, request);
    for (const stage of ["hr", "spv hr", "manager hr", "director"]) await service.decide(1, stage, "approve", 9, {}, false);
    assert.equal(request.status, "approved");
  }
});

test("HR approval no longer sets sick_letter_status; it is chosen on create and edit", async (t) => {
  const request = { id: 1, type: "Sick", status: "request hr", id_user_request: 5, sick_letter_status: "doctor letter" };
  const writes = mockLeaveRequest(t, request);
  await service.decide(1, "hr", "approve", 9, { sick_letter_status: "referral letter" }, false);
  assert.equal(request.sick_letter_status, "doctor letter");

  request.status = "request supervisor";
  await service.update(1, { sick_letter_status: "referral letter" }, 5, false);
  assert.deepEqual(writes.filter(([kind]) => kind === "request").at(-1), ["request", { sick_letter_status: "referral letter" }]);
});

test("leave request duration defaults to the inclusive day count", () => {
  assert.equal(service.dayCount("2026-10-14", "2026-10-14"), 1);
  assert.equal(service.dayCount("2026-10-30", "2026-11-02"), 4);
});

test("leave request create validates the form", async (t) => {
  const original = service.create;
  t.after(() => { service.create = original; });
  let saved;
  service.create = async (body) => { saved = body; return { id: 1 }; };
  const valid = {
    id_employee: 3, type: "Sick", start_date: "2026-10-14", end_date: "2026-10-15", reason: "Demam",
    health_facility_name: "Klinik Sehat", clinic_phone: "021-123", clinic_address: "Jl. A", doctor_name: "dr. B",
    files_attachment: [],
  };
  const res = response();
  await controller.create({ body: valid, user: { id: 5 } }, res);
  assert.equal(res.code, 201);
  assert.equal(saved.type, "Sick");
  for (const sickLetterStatus of ["doctor letter", "referral letter", null]) {
    const ok = response();
    await controller.create({ body: { ...valid, sick_letter_status: sickLetterStatus }, user: { id: 5 } }, ok);
    assert.equal(ok.code, 201);
  }

  for (const [body, message] of [
    [{ ...valid, type: " " }, /type is required/],
    [{ ...valid, start_date: "14-10-2026" }, /start_date must use YYYY-MM-DD/],
    [{ ...valid, end_date: "2026-10-13" }, /end_date must not be before start_date/],
    [{ ...valid, duration: 0 }, /duration must be a positive number/],
    [{ ...valid, reason: "" }, /reason is required/],
    [{ ...valid, clinic_phone: 21123 }, /clinic_phone must be a string/],
    [{ ...valid, files_attachment: "x" }, /files_attachment must be an array/],
    [{ ...valid, sick_letter_status: "attached" }, /sick_letter_status must be one of: doctor letter, referral letter/],
    [{ ...valid, id_employee: undefined }, /id_employee must be a positive integer/],
  ]) {
    const invalid = response();
    await controller.create({ body, user: { id: 5 } }, invalid);
    assert.equal(invalid.code, 400);
    assert.match(invalid.body.message, message);
  }
});

test("leave request stores the times and total_hours as sent, without counting hours", async (t) => {
  const originalCreate = models.db1.LeaveRequest.create;
  t.after(() => { models.db1.LeaveRequest.create = originalCreate; });
  const created = [];
  models.db1.LeaveRequest.create = async (data) => { created.push(data); return { id: 1, ...data }; };
  const request = { id: 1, status: "request supervisor", id_user_request: 5, start_date: "2026-10-14",
    end_date: "2026-10-14", start_time: "09:00:00", end_time: "11:00:00", total_hours: "2.00" };
  const writes = mockLeaveRequest(t, request);
  const body = { id_employee: 3, type: "Izin", start_date: "2026-10-14", end_date: "2026-10-14", reason: "Urusan bank" };

  await service.create({ ...body, start_time: "13:00", end_time: "15:30", total_hours: 2.5 }, 5, false);
  assert.deepEqual([created[0].start_time, created[0].end_time, created[0].total_hours], ["13:00", "15:30", 2.5]);
  await service.create({ ...body, start_time: "13:00", end_time: "15:30" }, 5, false);
  assert.equal(created[1].total_hours, undefined);
  await assert.rejects(service.create({ ...body, start_time: "13:00" }, 5, false), /must be sent together/);
  await assert.rejects(service.create({ ...body, start_time: "13:00", end_time: "12:00" }, 5, false),
    /end_time must be after start_time/);

  // Changing dates or times leaves total_hours alone unless it is sent.
  await service.update(1, { end_date: "2026-10-15", end_time: "12:00" }, 5, false);
  assert.deepEqual(writes.at(-2), ["request", { end_date: "2026-10-15", end_time: "12:00", duration: 2 }]);
  await service.update(1, { total_hours: 6 }, 5, false);
  assert.equal(request.total_hours, 6);
  await assert.rejects(service.update(1, { start_time: null }, 5, false), /must be sent together/);
});

test("leave request controller checks the time format and total_hours", async () => {
  const body = { id_employee: 3, type: "Izin", start_date: "2026-10-14", end_date: "2026-10-14", reason: "x" };
  for (const [input, message] of [
    [{ ...body, start_time: "8:00", end_time: "10:00" }, "start_time must use HH:mm format"],
    [{ ...body, start_time: "08:00", end_time: "24:00" }, "end_time must use HH:mm format"],
    [{ ...body, total_hours: 0 }, "total_hours must be a positive number"],
  ]) {
    const res = response();
    await controller.create({ body: input, user: { id: 5 } }, res);
    assert.deepEqual([res.code, res.body.message], [400, message]);
  }
});
