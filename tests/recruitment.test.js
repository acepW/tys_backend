const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const recruitment = require("../src/services/humanResource/recruitment/recruitment.service");
const approvalAccess = require("../src/services/approvalFlow/approvalAccess.service");
const fileService = require("../src/services/file.service");
const { models, db1 } = require("../src/models");

const modelNames = [
  "RecruitmentRequest", "RecruitmentRequestRevision", "RecruitmentCandidate", "RecruitmentHrInterview",
  "RecruitmentUserInterview", "RecruitmentOffering", "RecruitmentContract", "RecruitmentPsychotest",
  "RecruitmentInterviewScore", "RecruitmentReportItem", "RecruitmentUserInterviewer",
];

// Users by id; 5 and 8 are outside HR, 7 and 9 are in the HR division.
const users = {
  5: { id: 5, id_division: 1, division: { division_code: "SLM", division_name: "Sales & Marketing" } },
  7: { id: 7, id_division: 2, division: { division_code: "HR", division_name: "Human Resources" } },
  8: { id: 8, id_division: 3, division: { division_code: "GA", division_name: "General Affairs" } },
  9: { id: 9, id_division: 2, division: { division_code: "HR", division_name: "Human Resources" } },
};
const companies = { 1: { initial_company: "tys" }, 2: { initial_company: "TYSCS" } };
const orgMasters = {
  Department: { 3: { id: 3, department_name: "Sales & Marketing", is_active: true } },
  Division: { 1: { id: 1, division_name: "Sales & Marketing", id_department: 3, is_active: true } },
  Position: {
    2: { id: 2, position_name: "Staff", id_department: null, id_division: null, is_active: true },
    7: { id: 7, position_name: "Internal FAT Staff", id_department: 2, id_division: 5, is_active: true },
  },
};

// LIKE pattern as a regular expression: _ is one character, % any characters.
const likePattern = (pattern) =>
  new RegExp(`^${pattern.split("").map((char) =>
    char === "%" ? ".*" : char === "_" ? "." : char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("")}$`);

// In-memory tables for the recruitment models (DB1 only). `where` values that are
// arrays match any element, like Sequelize's IN; { [Op.like]: pattern } matches a
// LIKE pattern. authorizations records the approval flow checks of request edits.
function mockStore(t) {
  const tables = Object.fromEntries(modelNames.map((name) => [name, []]));
  const progress = [];
  const authorizations = [];
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (Array.isArray(value)) return value.includes(row[key]);
    if (value && typeof value === "object" && value[Op.like] !== undefined)
      return likePattern(value[Op.like]).test(row[key] ?? "");
    return row[key] === (key === "id" ? Number(value) : value);
  });
  const instance = (row) => ({ ...row, toJSON: () => ({ ...row }) });
  const replaced = [[db1, "transaction", async () => ({ LOCK: { UPDATE: "UPDATE" }, commit: async () => {}, rollback: async () => {} })]];
  for (const name of modelNames) {
    const model = models.db1[name];
    const rows = tables[name];
    replaced.push(
      [model, "findOne", async ({ where, order }) => {
        const found = rows.filter((row) => matches(row, where));
        if (order) found.reverse();
        return found[0] ? instance(found[0]) : null;
      }],
      [model, "findAll", async ({ where }) => rows.filter((row) => matches(row, where)).map(instance)],
      [model, "create", async (data) => {
        const row = { id: rows.length + 1, is_active: true, ...data };
        rows.push(row);
        return instance(row);
      }],
      [model, "update", async (data, { where }) => {
        Object.assign(rows.find((row) => row.id === where.id), data);
        return [1];
      }],
      [model, "max", async (column, { where }) => {
        const values = rows.filter((row) => matches(row, where)).map((row) => row[column]);
        return values.length ? Math.max(...values) : null;
      }],
    );
  }
  replaced.push([models.db1.RecruitmentVerificationProgress, "create", async (data) => {
    progress.push([data.module, data.id_document, data.status, data.note]);
    return data;
  }]);
  replaced.push([models.db1.User, "findByPk", async (id) => users[id] ?? null]);
  replaced.push([models.db1.User, "findOne", async ({ where }) => users[where.id] ?? null]);
  // Report master: one required and one optional (*) item.
  tables.RecruitmentReportItem.push(
    { id: 1, section: "Hasil Interview", group_name: "Faktor Utama", item_name: "Motivasi", is_optional: false, sort_order: 10, is_active: true },
    { id: 2, section: "Hasil Interview", group_name: "Faktor Lain", item_name: "Kemampuan Memimpin", is_optional: true, sort_order: 20, is_active: true },
  );
  replaced.push([models.db1.Company, "findOne", async ({ where }) => companies[where.id] ?? null]);
  // Department -> division -> position masters checked on a request (orgHierarchy).
  for (const [name, rows] of Object.entries(orgMasters))
    replaced.push([models.db1[name], "findByPk", async (id) => rows[id] ?? null]);
  replaced.push([approvalAccess, "authorize", async (...args) => { authorizations.push(args); }]);
  replaced.push([fileService, "syncFiles", async () => {}]);
  for (const service of Object.values(recruitment.services))
    replaced.push([service, "getById", async (id) => tables[service.config.modelName].find((row) => row.id === Number(id))]);
  const originals = replaced.map(([target, key]) => [target, key, target[key]]);
  t.after(() => { for (const [target, key, value] of originals) target[key] = value; });
  for (const [target, key, value] of replaced) target[key] = value;
  return { tables, progress, authorizations };
}

const requestBody = {
  id_company: 1, id_department: 3, id_division: 1, id_position: 2, id_level: 1, number_of_people: 2,
  current_division_member: 4, hard_skill: "Excel", soft_skill: "Teliti", other_requirement: "Pengalaman 1 tahun",
  job_description: "Admin gudang", request_type: "replacement", reason: "Karyawan resign",
  hiring_deadline: "2026-12-01",
};
const requestProgress = (progress) => progress.filter(([module]) => module === "request").map(([, , status]) => status);
const approve = (by) => recruitment.request.decide(1, "approve", by, null, false);
const reject = (by, rejectTo, note = "Perlu diperbaiki") =>
  recruitment.request.decide(1, "reject", by, note, false, rejectTo);

test("Recruitment request gets a number and goes HR Staff -> SPV HR -> Manager HR -> Director -> approve", async (t) => {
  const { tables, progress } = mockStore(t);
  for (const [body, message] of [
    [{ id_level: undefined }, /id_level is required/],
    [{ current_division_member: undefined }, /current_division_member is required/],
    [{ current_division_member: -1 }, /current_division_member must be a whole number of 0 or more/],
    [{ number_of_people: 0 }, /number_of_people must be a positive integer/],
    [{ request_type: "new" }, /request_type must be one of: replacement, additional member/],
    [{ hiring_deadline: "01-12-2026" }, /hiring_deadline must use YYYY-MM-DD/],
    [{ salary_min: 9000000, salary_max: 5000000 }, /salary_min cannot be more than salary_max/],
    [{ id_company: 3 }, /Company not found/],
  ])
    await assert.rejects(recruitment.request.create({ ...requestBody, ...body }, 5, false), message);

  const request = await recruitment.request.create(
    { ...requestBody, salary_min: 5000000, salary_max: 6000000, job_requirement: "ignored", request_no: "X" }, 5, false);
  assert.match(request.request_no, /^REC-TYS-\d{2}-\d{4}-0001$/);
  assert.deepEqual([request.status, request.id_user_request, request.current_division_member, request.salary_min,
    request.job_requirement], ["request hr staff", 5, 4, 5000000, undefined]);
  const second = await recruitment.request.create(requestBody, 5, false);
  assert.match(second.request_no, /^REC-TYS-\d{2}-\d{4}-0002$/);
  assert.match((await recruitment.request.create({ ...requestBody, id_company: 2 }, 5, false)).request_no,
    /^REC-TYSCS-\d{2}-\d{4}-0001$/);
  assert.equal(tables.RecruitmentRequest.length, 3);

  await assert.rejects(recruitment.request.decide(1, "reject", 7, " ", false), /note is required/);
  for (const next of ["request spv hr", "request manager hr", "request director", "approve"]) {
    await approve(7);
    assert.equal(request.status, next);
  }
  await assert.rejects(reject(7, "requester"), /already approve/);
  await assert.rejects(recruitment.request.update(1, { reason: "x" }, 5, false), /cannot be edited while it is approve/);
  assert.deepEqual(requestProgress(progress).slice(-5),
    ["created", "approve hr staff", "approve spv hr", "approve manager hr", "approve director"]);
});

test("A rejection returns the request to an earlier stage or to the requester, who resubmits it", async (t) => {
  const { progress } = mockStore(t);
  const request = await recruitment.request.create(requestBody, 5, false);
  // HR Staff can only return it to the requester.
  await assert.rejects(reject(7, "spv hr"), /reject_to must be one of: requester/);
  await reject(7);
  assert.equal(request.status, "returned to requester");
  await assert.rejects(approve(7), /already returned to requester/);
  await assert.rejects(recruitment.request.resubmit(1, 8, null, false), /Only the requester can resubmit/);
  await recruitment.request.resubmit(1, 5, "Sudah diperbaiki", false);
  assert.equal(request.status, "request hr staff");
  await assert.rejects(recruitment.request.resubmit(1, 5, null, false), /not request hr staff/);

  await approve(7);
  await assert.rejects(reject(8), /reject_to must be one of: hr staff, requester/);
  await reject(8, "hr staff");
  assert.equal(request.status, "request hr staff");
  await approve(7);
  await approve(8);
  assert.equal(request.status, "request manager hr");
  await assert.rejects(reject(9, "hr staff"), /reject_to must be one of: spv hr, requester/);
  await reject(9, "spv hr", "Salary range terlalu tinggi");
  assert.equal(request.status, "request spv hr");
  // From SPV HR it goes up through Manager HR and Director again.
  await approve(8);
  await approve(9);
  await reject(9, "requester");
  assert.equal(request.status, "returned to requester");
  assert.deepEqual(requestProgress(progress), [
    "created", "reject hr staff to requester", "resubmitted", "approve hr staff", "reject spv hr to hr staff",
    "approve hr staff", "approve spv hr", "reject manager hr to spv hr", "approve spv hr", "approve manager hr",
    "reject director to requester",
  ]);
  assert.deepEqual(progress.find(([, , status]) => status === "reject manager hr to spv hr")[3], "Salary range terlalu tinggi");
});

test("A request from the HR division starts, and is resubmitted, at SPV HR", async (t) => {
  mockStore(t);
  const request = await recruitment.request.create(requestBody, 9, false);
  assert.equal(request.status, "request spv hr");
  await reject(7, "requester");
  await recruitment.request.resubmit(1, 9, null, false);
  assert.equal(request.status, "request spv hr");
  await approve(7);
  assert.equal(request.status, "request manager hr");

  const hr = (division_code, division_name) => recruitment.isHrDivision({ division_code, division_name });
  for (const [code, name] of [["HR", "Human Resources"], ["hrd", "Personalia"], ["HRGA", "HR & GA"],
    ["PSN", "Human Resource Development"], ["X", "HR Department"]])
    assert.equal(hr(code, name), true, `${code} / ${name}`);
  for (const [code, name] of [["SLM", "Sales & Marketing"], ["GA", "General Affairs"], ["IFAT", "Internal FAT"]])
    assert.equal(hr(code, name), false, `${code} / ${name}`);
  assert.equal(recruitment.isHrDivision(null), false);
});

test("Each stage edits only its own fields, and every change is kept as a revision", async (t) => {
  const { tables, progress, authorizations } = mockStore(t);
  const request = await recruitment.request.create(requestBody, 5, false);

  // HR Staff: job requirement and job description. Other fields sent unchanged are dropped.
  await recruitment.request.update(1, { hard_skill: "Excel, SAP", job_description: "Admin gudang & stok",
    reason: "Karyawan resign", number_of_people: "2" }, 7, false);
  await assert.rejects(recruitment.request.update(1, { reason: "Tambah shift" }, 7, false),
    /Only hard_skill, soft_skill, other_requirement, job_description can be edited while the request is request hr staff \(changed: reason\)/);
  await approve(7);

  // SPV HR: salary range.
  await assert.rejects(recruitment.request.update(1, { hard_skill: "x" }, 8, false), /changed: hard_skill/);
  await assert.rejects(recruitment.request.update(1, { salary_min: 7000000, salary_max: 6000000 }, 8, false),
    /salary_min cannot be more than salary_max/);
  await recruitment.request.update(1, { salary_min: 5000000, salary_max: "6000000" }, 8, false);
  await approve(8);

  // Manager HR and Director change nothing.
  await assert.rejects(recruitment.request.update(1, { salary_max: 7000000 }, 9, false),
    /cannot be edited while it is request manager hr/);

  // The requester changes everything once it is returned, and only they can.
  await reject(9, "requester");
  await assert.rejects(recruitment.request.update(1, { number_of_people: 3 }, 7, false),
    /Only the requester can edit a request returned to them/);
  await recruitment.request.update(1, { number_of_people: 3, reason: "Tambah shift malam" }, 5, false);
  assert.deepEqual([request.number_of_people, request.reason, request.hard_skill],
    [3, "Tambah shift malam", "Excel, SAP"]);

  assert.deepEqual(tables.RecruitmentRequestRevision.map((row) =>
    [row.revision_no, row.id_user, row.field, row.old_value, row.new_value]), [
    [1, 7, "hard_skill", "Excel", "Excel, SAP"],
    [1, 7, "job_description", "Admin gudang", "Admin gudang & stok"],
    [2, 8, "salary_min", null, "5000000"],
    [2, 8, "salary_max", null, "6000000"],
    [3, 5, "number_of_people", "2", "3"],
    [3, 5, "reason", "Karyawan resign", "Tambah shift malam"],
  ]);
  assert.deepEqual(progress.filter(([, , status]) => status === "revised").map(([, , , note]) => note), [
    "Recruitment request revised: hard_skill, job_description",
    "Recruitment request revised: salary_min, salary_max",
    "Recruitment request revised: number_of_people, reason",
  ]);
  // Stage edits are checked against that stage's approval flow (also the SPV HR edit
  // refused for its salary range, which is validated after); the requester's are not.
  assert.deepEqual(authorizations.map(([approvalFor, id, userId, statuses]) => [approvalFor, id, userId, statuses]), [
    ["recruitment request", 1, 7, ["request hr staff"]],
    ["recruitment request", 1, 8, ["request spv hr"]],
    ["recruitment request", 1, 8, ["request spv hr"]],
  ]);
});

test("Hiring can be closed and reopened once the request is approved", async (t) => {
  const { progress } = mockStore(t);
  const request = await recruitment.request.create(requestBody, 5, false);
  request.hiring_status = "open";
  await assert.rejects(recruitment.request.setHiringStatus(1, "close", 7, null, false),
    /only be changed on an approved request, not request hr staff/);
  for (let i = 0; i < 4; i++) await approve(7);
  await assert.rejects(recruitment.request.setHiringStatus(1, "closed", 7, null, false),
    /hiring_status must be one of: open, close/);
  await assert.rejects(recruitment.request.setHiringStatus(1, "open", 7, null, false), /already open/);
  await recruitment.request.setHiringStatus(1, "close", 7, "Posisi sudah terisi", false);
  assert.equal(request.hiring_status, "close");
  await recruitment.request.setHiringStatus(1, "open", 7, null, false);
  assert.equal(request.hiring_status, "open");
  assert.deepEqual(requestProgress(progress).slice(-2), ["hiring close", "hiring open"]);
});

// An approved recruitment request that is still hiring, for candidates to apply to.
function addOpenRequest(tables, extra = {}) {
  const row = {
    id: tables.RecruitmentRequest.length + 1, is_active: true, status: "approve", hiring_status: "open",
    id_company: 1, id_department: 3, id_division: 1, id_position: 2, id_level: 1, ...extra,
  };
  tables.RecruitmentRequest.push(row);
  return row;
}

const cv = [{ original_name: "cv.pdf", stored_name: "cv.pdf", url: "/files/recruitment/cv.pdf", mime_type: "application/pdf", size: 1 }];
const candidateBody = (data = {}) => ({ id_recruitment_request: 1, name: "Budi", files_cv: cv,
  has_professional_license: false, ...data });

test("A candidate applies to an approved, open request and copies its company, department, division, position and level", async (t) => {
  const { tables } = mockStore(t);
  addOpenRequest(tables);
  addOpenRequest(tables, { hiring_status: "close" });
  addOpenRequest(tables, { status: "request director" });
  addOpenRequest(tables, { id_company: 2, id_department: 4, id_division: 5, id_position: 7, id_level: 2 });

  await assert.rejects(recruitment.candidate.create(candidateBody({ id_recruitment_request: undefined }), 5, false),
    /id_recruitment_request is required/);
  await assert.rejects(recruitment.candidate.create(candidateBody({ id_recruitment_request: 99 }), 5, false),
    /Recruitment request not found/);
  await assert.rejects(recruitment.candidate.create(candidateBody({ id_recruitment_request: 2 }), 5, false),
    /hiring is closed/);
  await assert.rejects(recruitment.candidate.create(candidateBody({ id_recruitment_request: 3 }), 5, false),
    /is request director, not approved yet/);
  await assert.rejects(recruitment.candidate.create(candidateBody({ email: "budi@" }), 5, false),
    /email must be a valid email address/);

  const candidate = await recruitment.candidate.create(candidateBody({
    phone_number: "0812-3456-7890", email: "budi@example.com",
    hr_interview_meeting_room: "Ruang Meeting 2", hr_interview_meeting_room_link: "https://meet.google.com/abc-defg-hij",
    // Ignored: these always come from the request.
    id_company: 9, id_position: 9,
  }), 5, false);
  const masters = (row) => [row.id_company, row.id_department, row.id_division, row.id_position, row.id_level];
  assert.deepEqual(masters(candidate), [1, 3, 1, 2, 1]);
  assert.deepEqual([candidate.phone_number, candidate.email, candidate.hr_interview_meeting_room,
    candidate.hr_interview_meeting_room_link],
  ["0812-3456-7890", "budi@example.com", "Ruang Meeting 2", "https://meet.google.com/abc-defg-hij"]);

  await recruitment.candidate.update(1, { phone_number: "0813", id_department: 8 }, 5, false);
  assert.deepEqual(masters(candidate), [1, 3, 1, 2, 1]);
  await recruitment.candidate.update(1, { id_recruitment_request: 4 }, 5, false);
  assert.deepEqual([candidate.id_recruitment_request, ...masters(candidate)], [4, 2, 4, 5, 7, 2]);
  await assert.rejects(recruitment.candidate.update(1, { id_recruitment_request: null }, 5, false),
    /id_recruitment_request is required/);
});

test("A candidate is saved without approval, needs a CV and a professional license answer", async (t) => {
  const { tables, progress } = mockStore(t);
  addOpenRequest(tables);
  await assert.rejects(recruitment.candidate.create(candidateBody({ files_cv: undefined }), 5, false),
    /files_cv must be a non-empty array/);
  await assert.rejects(recruitment.candidate.create(candidateBody({ files_cv: [] }), 5, false),
    /files_cv must be a non-empty array/);
  for (const [data, message] of [
    [{ has_professional_license: undefined }, /has_professional_license must be true or false/],
    [{ has_professional_license: "yes" }, /has_professional_license must be true or false/],
    [{ has_professional_license: true }, /license_type must be one of: pharmacist, healthcare professional/],
    [{ has_professional_license: true, license_type: "pilot" }, /license_type must be one of/],
    [{ has_professional_license: true, license_type: "other", license_type_other: " " },
      /license_type_other is required when license_type is other/],
  ])
    await assert.rejects(recruitment.candidate.create(candidateBody(data), 5, false), message);

  const candidate = await recruitment.candidate.create(candidateBody({
    has_professional_license: true, license_type: "pharmacist", license_type_other: "ignored" }), 5, false);
  assert.deepEqual([candidate.status, candidate.id_user_request, candidate.license_type, candidate.license_type_other],
    [undefined, 5, "pharmacist", null]);
  await recruitment.candidate.update(1, { license_type: "other", license_type_other: "Ahli gizi" }, 5, false);
  assert.deepEqual([candidate.license_type, candidate.license_type_other], ["other", "Ahli gizi"]);
  await recruitment.candidate.update(1, { has_professional_license: false }, 5, false);
  assert.deepEqual([candidate.license_type, candidate.license_type_other], [null, null]);
  // Hiring status (2026-11-24): a new candidate is "contacting"; edits ignore it and
  // HR changes it with setHiringStatus to any of the 15 values, kept in the history.
  assert.equal(candidate.hiring_status, "contacting");
  await recruitment.candidate.update(1, { hiring_status: "onboarding" }, 5, false);
  assert.equal(candidate.hiring_status, "contacting");
  await assert.rejects(recruitment.candidate.setHiringStatus(1, "Menunggu jadwal", 5, null, false),
    /hiring_status must be one of: contacting, no response/);
  await recruitment.candidate.setHiringStatus(1, "no response", 5, "Tidak mengangkat telepon", false);
  assert.equal(candidate.hiring_status, "no response");
  assert.ok(candidate.hiring_status_updated_at instanceof Date);
  assert.deepEqual(progress.at(-1), ["candidate", 1, "hiring status no response",
    "Hiring status contacting → no response: Tidak mengangkat telepon"]);
  await assert.rejects(recruitment.candidate.setHiringStatus(1, "no response", 5, null, false),
    (error) => error.statusCode === 409 && /already no response/.test(error.message));
  await recruitment.candidate.setHiringStatus(1, "contacting", 5, null, false); // back again (H1)
  assert.equal(candidate.hiring_status, "contacting");
  await assert.rejects(recruitment.candidate.update(1, { files_cv: [] }, 5, false), /files_cv cannot be emptied/);
  // A candidate from before the license fields can be edited without answering it.
  tables.RecruitmentCandidate.push({ id: 2, is_active: true, id_recruitment_request: 1, name: "Lama",
    has_professional_license: null });
  await recruitment.candidate.update(2, { phone_number: "0812" }, 5, false);
  await assert.rejects(recruitment.candidate.update(2, { license_type: "pharmacist" }, 5, false),
    /has_professional_license is required to set a license type/);

  // No approval at all.
  await assert.rejects(recruitment.candidate.decide(1, "approve", 7, null, false), /has no approval/);
  assert.deepEqual(progress.filter(([module]) => module === "candidate").map(([, , status]) => status),
    ["created", "edited", "edited", "edited", "hiring status no response", "hiring status contacting", "edited"]);
});

// HR interview (2026-11-24): scheduled, then its result; no approval.
const schedule = (data = {}) => ({
  id_recruitment_candidate: 1, interview_date: "2026-11-25", interview_time: "09:00", method: "offline",
  meeting_room: "Ruang Meeting 2", ...data,
});
// User interview (2026-11-24): one or more interviewers, each with a schedule.
const interviewerRow = (idUser, data = {}) => ({
  id_user: idUser, interview_date: "2026-11-28", interview_time: "10:00", method: "online",
  meeting_link: "https://meet.google.com/xyz", ...data,
});
const userSchedule = (data = {}) => ({ id_recruitment_candidate: 1, interviewers: [interviewerRow(7)], ...data });
const decision = (value, data = {}) => ({ decision: value, scores: [{ id_report_item: 1, score: "B" }], description: "Cocok", ...data });
const recommended = (data = {}) => ({
  attendance: "attended", recommendation: "recommended", description: "Komunikatif",
  scores: [{ id_report_item: 1, score: "B" }, { id_report_item: 2, score: null }],
  psychotests: [{ tool_name: "DISC", description: "Dominan", files_result: [] }], ...data,
});

test("HR schedules an HR interview, then fills its result, which moves the hiring status", async (t) => {
  const { tables, progress } = mockStore(t);
  addOpenRequest(tables);
  const candidate = await recruitment.candidate.create(candidateBody(), 5, false);
  for (const [data, message] of [
    [{ interview_time: undefined }, /interview_time is required/],
    [{ method: "hybrid" }, /method must be one of: online, offline/],
    [{ meeting_room: " " }, /meeting_room is required for an offline interview/],
    [{ method: "online" }, /meeting_link is required for an online interview/],
    [{ interview_date: "25-11-2026" }, /YYYY-MM-DD/],
    [{ id_user_interviewer: 99 }, /Interviewer not found/],
  ])
    await assert.rejects(recruitment.hrInterview.create(schedule(data), 5, false), message);

  const interview = await recruitment.hrInterview.create(schedule({ meeting_link: "ignored" }), 5, false);
  assert.deepEqual([interview.status, interview.id_user_interviewer, interview.meeting_link, interview.candidate_name],
    ["scheduled", 5, null, "Budi"]);
  assert.equal(candidate.hiring_status, "hr interview");
  await assert.rejects(recruitment.hrInterview.create(schedule(), 5, false), /already has a scheduled hr interview/);

  // Rescheduled while scheduled; online needs a link and clears the room.
  await recruitment.hrInterview.update(1, { method: "online", meeting_link: "https://meet.google.com/abc", id_user_interviewer: 7 }, 5, false);
  assert.deepEqual([interview.method, interview.meeting_room, interview.id_user_interviewer], ["online", null, 7]);

  // Result: every required report item needs a score.
  for (const [data, message] of [
    [{ attendance: "late" }, /attendance must be one of: attended, no show/],
    [{ recommendation: "maybe" }, /recommendation must be one of: recommended, not recommended/],
    [{ scores: [{ id_report_item: 2, score: "B" }] }, /Every required report item needs a score: Motivasi/],
    [{ scores: [{ id_report_item: 1, score: "A" }] }, /score must be one of: KS, K, C, B, BS/],
    [{ scores: [{ id_report_item: 9, score: "B" }] }, /not an active report item/],
    [{ psychotests: [{ description: "x" }] }, /psychotests\[0\].tool_name is required/],
  ])
    await assert.rejects(recruitment.hrInterview.submitResult(1, recommended(data), 7, false), message);

  await recruitment.hrInterview.submitResult(1, recommended(), 7, false);
  assert.deepEqual([interview.status, interview.attendance, interview.recommendation, interview.description, interview.id_user_result],
    ["completed", "attended", "recommended", "Komunikatif", 7]);
  assert.deepEqual(tables.RecruitmentInterviewScore.map((row) => [row.interview_type, row.id_interview, row.item_name, row.score]),
    [["hr", 1, "Motivasi", "B"], ["hr", 1, "Kemampuan Memimpin", null]]);
  assert.deepEqual(tables.RecruitmentPsychotest.map((row) => [row.id_recruitment_hr_interview, row.tool_name]), [[1, "DISC"]]);
  assert.equal(candidate.hiring_status, "user interview");
  assert.ok(progress.some(([module, , status]) => module === "hr interview" && status === "recommended"));
  await assert.rejects(recruitment.hrInterview.submitResult(1, recommended(), 7, false), /filled once/);
  await assert.rejects(recruitment.hrInterview.update(1, { interview_time: "10:00" }, 5, false), /cannot be edited while it is completed/);
  await assert.rejects(recruitment.hrInterview.decide(1, "approve", 7, null, false), /HR interview is already completed/);
});

test("A no show can be scheduled again; not recommended rejects the candidate", async (t) => {
  const { tables } = mockStore(t);
  addOpenRequest(tables);
  const candidate = await recruitment.candidate.create(candidateBody({ name: "Sari" }), 5, false);
  await recruitment.hrInterview.create(schedule(), 5, false);
  await recruitment.hrInterview.submitResult(1, { attendance: "no show", scores: [{ id_report_item: 1, score: "B" }] }, 5, false);
  assert.deepEqual([tables.RecruitmentHrInterview[0].status, tables.RecruitmentHrInterview[0].recommendation], ["no show", null]);
  assert.equal(tables.RecruitmentInterviewScore.length, 0);
  assert.equal(candidate.hiring_status, "hr interview no show");
  await assert.rejects(recruitment.userInterview.create(userSchedule(), 5, false),
    /needs an HR interview that recommended the candidate/);

  await recruitment.hrInterview.create(schedule({ interview_date: "2026-11-27" }), 5, false);
  assert.equal(candidate.hiring_status, "hr interview");
  await recruitment.hrInterview.submitResult(2, recommended({ recommendation: "not recommended" }), 5, false);
  assert.equal(candidate.hiring_status, "hr interview rejected");
  await assert.rejects(recruitment.userInterview.create(userSchedule(), 5, false),
    /needs an HR interview that recommended the candidate/);
  await assert.rejects(recruitment.hrInterview.create(schedule(), 5, false), /already has a completed hr interview/);
});

// A candidate recommended at the HR interview, ready for the user interview.
async function recommendedCandidate(t, data = {}) {
  const store = mockStore(t);
  addOpenRequest(store.tables);
  const candidate = await recruitment.candidate.create(candidateBody({ job_title: "Staff", source: "JobStreet", ...data }), 5, false);
  await recruitment.hrInterview.create(schedule(), 5, false);
  await recruitment.hrInterview.submitResult(1, recommended(), 5, false);
  return { ...store, candidate };
}

test("HR schedules a user interview with several interviewers, each with a schedule", async (t) => {
  const { tables, candidate } = await recommendedCandidate(t);
  for (const [data, message] of [
    [{ interviewers: [] }, /interviewers must be a non-empty array/],
    [{ interviewers: [interviewerRow(7, { meeting_link: "" })] }, /interviewers\[0\]: meeting_link is required for an online interview/],
    [{ interviewers: [interviewerRow(7), interviewerRow(7)] }, /interviewers\[1\]: the same user is listed twice/],
    [{ interviewers: [interviewerRow(99)] }, /interviewers\[0\]: user not found/],
  ])
    await assert.rejects(recruitment.userInterview.create(userSchedule(data), 5, false), message);

  const doc = await recruitment.userInterview.create(userSchedule({
    interviewers: [interviewerRow(7), interviewerRow(9, { interview_date: "2026-11-29", method: "offline", meeting_room: "Ruang Direksi" })],
  }), 5, false);
  assert.equal(doc.status, "scheduled");
  assert.deepEqual(tables.RecruitmentUserInterviewer.map((row) => [row.id_user, row.interview_date, row.method, row.meeting_room, row.meeting_link]),
    [[7, "2026-11-28", "online", null, "https://meet.google.com/xyz"], [9, "2026-11-29", "offline", "Ruang Direksi", null]]);
  assert.equal(candidate.hiring_status, "user interview");
  await assert.rejects(recruitment.userInterview.create(userSchedule(), 5, false), /already has a scheduled user interview/);

  // Reschedule: update one, drop the other, add a new one.
  await recruitment.userInterview.update(1, { interviewers: [{ id: 1, ...interviewerRow(7, { interview_time: "14:00" }) }, interviewerRow(8)] }, 5, false);
  const active = tables.RecruitmentUserInterviewer.filter((row) => row.is_active);
  assert.deepEqual(active.map((row) => [row.id_user, row.interview_time]), [[7, "14:00"], [8, "10:00"]]);

  // Once attended, an interviewer cannot be changed or removed.
  await recruitment.userInterview.setAttendance(1, 1, "attended", 5, false);
  await assert.rejects(recruitment.userInterview.update(1, { interviewers: [interviewerRow(8)] }, 5, false),
    /already has an attendance and cannot be removed/);
});

test("Every interviewer decides; any considered keeps the candidate 14 days, then the decision is final", async (t) => {
  const { tables, candidate } = await recommendedCandidate(t);
  await recruitment.userInterview.create(userSchedule({ interviewers: [interviewerRow(7), interviewerRow(9)] }), 5, false);
  const doc = tables.RecruitmentUserInterview[0];

  await assert.rejects(recruitment.userInterview.submitDecision(1, 1, decision("accepted"), 7, false), /attended first/);
  await recruitment.userInterview.setAttendance(1, 1, "attended", 5, false);
  await assert.rejects(recruitment.userInterview.setAttendance(1, 1, "no show", 5, false), /already attended/);
  await assert.rejects(recruitment.userInterview.submitDecision(1, 1, decision("maybe"), 7, false), /decision must be one of: accepted, considered, not accepted/);
  await assert.rejects(recruitment.userInterview.submitDecision(1, 1, decision("accepted", { scores: [] }), 7, false),
    /Every required report item needs a score: Motivasi/);
  await recruitment.userInterview.submitDecision(1, 1, decision("accepted"), 7, false);
  assert.equal(doc.status, "scheduled"); // waiting for the second interviewer
  assert.deepEqual(tables.RecruitmentInterviewScore.filter((row) => row.interview_type === "user").map((row) => [row.id_interview, row.score]),
    [[1, "B"], [1, null]]);

  await recruitment.userInterview.setAttendance(1, 2, "attended", 5, false);
  await recruitment.userInterview.submitDecision(1, 2, decision("considered"), 9, false);
  const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  assert.deepEqual([doc.status, doc.result, doc.consideration_due_date], ["completed", "considered", due]);
  assert.equal(candidate.hiring_status, "user interview consideration");
  await assert.rejects(recruitment.offering.create({ id_recruitment_candidate: 1 }, 5, false), /needs a user interview that accepted/);

  // Only the considering interviewer may change, and only to a final decision.
  await assert.rejects(recruitment.userInterview.submitDecision(1, 1, decision("not accepted"), 7, false),
    /can only change while the candidate is considered/);
  await assert.rejects(recruitment.userInterview.submitDecision(1, 2, decision("considered"), 9, false), /already considered/);
  await recruitment.userInterview.submitDecision(1, 2, { decision: "accepted" }, 9, false);
  assert.deepEqual([doc.result, doc.consideration_due_date], ["accepted", null]);
  assert.equal(candidate.hiring_status, "offering letter");
  assert.equal(tables.RecruitmentInterviewScore.filter((row) => row.id_interview === 2).length, 2); // report kept

  // The offering takes its defaults from the user interview, as before.
  await assert.rejects(recruitment.userInterview.update(1, { recommended_salary: 6000000 }, 5, false),
    /cannot be edited while it is completed/);
  // The new user interview form has no start date, so the offering needs its own (H15).
  await assert.rejects(recruitment.offering.create({ id_recruitment_candidate: 1 }, 5, false), /effective_date is required/);
  const offering = await recruitment.offering.create({ id_recruitment_candidate: 1, birth_place: "Bandung",
    effective_date: "2026-12-01" }, 5, false);
  assert.deepEqual([offering.job_title, offering.id_department, offering.effective_date], ["Staff", 3, "2026-12-01"]);
  await recruitment.offering.decide(1, "approve", 7, null, false);
  const contract = await recruitment.contract.create({ id_recruitment_candidate: 1, nik: "3201", gender: "Male",
    contract_type: "PKWT", end_date: "2027-11-01" }, 5, false);
  assert.deepEqual([contract.candidate_name, contract.birth_place], ["Budi", "Bandung"]);
});

test("Any not accepted rejects; a no show ends the user interview at once and can be rescheduled", async (t) => {
  const { tables, candidate } = await recommendedCandidate(t);
  await recruitment.userInterview.create(userSchedule({ interviewers: [interviewerRow(7), interviewerRow(9)] }), 5, false);
  await recruitment.userInterview.setAttendance(1, 1, "attended", 5, false);
  await recruitment.userInterview.setAttendance(1, 2, "no show", 5, false);
  assert.equal(tables.RecruitmentUserInterview[0].status, "no show");
  assert.equal(candidate.hiring_status, "user interview no show");
  await assert.rejects(recruitment.userInterview.submitDecision(1, 1, decision("accepted"), 7, false), /The user interview is no show/);

  await recruitment.userInterview.create(userSchedule({ interviewers: [interviewerRow(7), interviewerRow(9)] }), 5, false);
  assert.equal(candidate.hiring_status, "user interview");
  for (const id of [3, 4]) await recruitment.userInterview.setAttendance(2, id, "attended", 5, false);
  await recruitment.userInterview.submitDecision(2, 3, decision("considered"), 7, false);
  await recruitment.userInterview.submitDecision(2, 4, decision("not accepted"), 9, false);
  assert.deepEqual([tables.RecruitmentUserInterview[1].result, candidate.hiring_status], ["not accepted", "user interview rejected"]);
});

test("Interview saya lists what each interviewer waits for, with the reminder 3 days before the end", async (t) => {
  const { tables } = await recommendedCandidate(t);
  await recruitment.userInterview.create(userSchedule({ interviewers: [interviewerRow(7), interviewerRow(9)] }), 5, false);
  const { RecruitmentUserInterviewer } = models.db1;
  const kept = RecruitmentUserInterviewer.findAll;
  t.after(() => { RecruitmentUserInterviewer.findAll = kept; });
  // The in-memory store does not join: attach the user interview by hand.
  RecruitmentUserInterviewer.findAll = async (options) => options.where.id_user === undefined
    ? kept(options)
    : tables.RecruitmentUserInterviewer
      .filter((row) => row.id_user === options.where.id_user && row.is_active)
      .map((row) => ({ toJSON: () => ({ ...row, user_interview: { ...tables.RecruitmentUserInterview.find((doc) => doc.id === row.id_recruitment_user_interview) } }) }));

  assert.deepEqual((await recruitment.userInterview.mine(7)).map((row) => [row.waits_for_attendance, row.needs_report]), [[true, false]]);
  await recruitment.userInterview.setAttendance(1, 1, "attended", 5, false);
  await recruitment.userInterview.setAttendance(1, 2, "attended", 5, false);
  assert.deepEqual((await recruitment.userInterview.mine(7, { pending: true })).map((row) => row.needs_report), [true]);
  await recruitment.userInterview.submitDecision(1, 1, decision("considered"), 7, false);
  await recruitment.userInterview.submitDecision(1, 2, decision("accepted"), 9, false);
  assert.deepEqual((await recruitment.userInterview.mine(9, { pending: true })), []);
  const [mine] = await recruitment.userInterview.mine(7, { pending: true });
  assert.deepEqual([mine.needs_final_decision, mine.needs_decision_reminder], [true, false]);
  // Three days before the end the reminder is on; after it, it is overdue.
  tables.RecruitmentUserInterview[0].consideration_due_date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  assert.equal((await recruitment.userInterview.mine(7))[0].needs_decision_reminder, true);
  tables.RecruitmentUserInterview[0].consideration_due_date = "2020-01-01";
  assert.equal((await recruitment.userInterview.mine(7))[0].is_consideration_overdue, true);
});

test("A request's department, division and position must fit together", async (t) => {
  const { tables } = mockStore(t);
  // Internal FAT Staff belongs to Internal FAT, not to Sales & Marketing.
  await assert.rejects(recruitment.request.create({ ...requestBody, id_position: 7 }, 5, false),
    (error) => error.statusCode === 400 && /Internal FAT Staff belongs to department 2, not 3/.test(error.message));
  await assert.rejects(recruitment.request.create({ ...requestBody, id_department: 4 }, 5, false),
    (error) => error.statusCode === 404 && /Department not found/.test(error.message));
  assert.equal(tables.RecruitmentRequest.length, 0);
});
