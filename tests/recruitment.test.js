const test = require("node:test");
const assert = require("node:assert/strict");
const recruitment = require("../src/services/humanResource/recruitment/recruitment.service");
const { models, db1 } = require("../src/models");

const modelNames = [
  "RecruitmentRequest", "RecruitmentRequestRevision", "RecruitmentCandidate", "RecruitmentHrInterview",
  "RecruitmentUserInterview", "RecruitmentOffering", "RecruitmentContract",
];

// Users by id; 5 and 8 are outside HR, 7 and 9 are in the HR division.
const users = {
  5: { id: 5, id_division: 1, division: { division_code: "SLM", division_name: "Sales & Marketing" } },
  7: { id: 7, id_division: 2, division: { division_code: "HR", division_name: "Human Resources" } },
  8: { id: 8, id_division: 3, division: { division_code: "GA", division_name: "General Affairs" } },
  9: { id: 9, id_division: 2, division: { division_code: "HR", division_name: "Human Resources" } },
};

// In-memory tables for the recruitment models (DB1 only). `where` values that are
// arrays match any element, like Sequelize's IN.
function mockStore(t) {
  const tables = Object.fromEntries(modelNames.map((name) => [name, []]));
  const progress = [];
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) =>
    Array.isArray(value) ? value.includes(row[key]) : row[key] === (key === "id" ? Number(value) : value));
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
  for (const service of Object.values(recruitment.services))
    replaced.push([service, "getById", async (id) => tables[service.config.modelName].find((row) => row.id === Number(id))]);
  const originals = replaced.map(([target, key]) => [target, key, target[key]]);
  t.after(() => { for (const [target, key, value] of originals) target[key] = value; });
  for (const [target, key, value] of replaced) target[key] = value;
  return { tables, progress };
}

const requestBody = {
  id_company: 1, id_department: 3, id_division: 1, id_position: 2, id_level: 1, number_of_people: 2,
  job_requirement: "Pengalaman 1 tahun", job_description: "Admin gudang", request_type: "replacement",
  reason: "Karyawan resign", hiring_deadline: "2026-12-01",
};
const requestProgress = (progress) => progress.filter(([module]) => module === "request").map(([, , status]) => status);

test("Recruitment request is created to HR Staff, then SPV/Manager HR -> Director -> approve", async (t) => {
  const { progress } = mockStore(t);
  await assert.rejects(recruitment.request.create({ ...requestBody, id_level: undefined }, 5, false), /id_level is required/);
  await assert.rejects(recruitment.request.create({ ...requestBody, number_of_people: 0 }, 5, false),
    /number_of_people must be a positive integer/);
  await assert.rejects(recruitment.request.create({ ...requestBody, request_type: "new" }, 5, false),
    /request_type must be one of: replacement, additional member/);
  await assert.rejects(recruitment.request.create({ ...requestBody, hiring_deadline: "01-12-2026" }, 5, false),
    /hiring_deadline must use YYYY-MM-DD/);

  const request = await recruitment.request.create(requestBody, 5, false);
  assert.deepEqual([request.status, request.id_user_request, request.hiring_status], ["request hr staff", 5, undefined]);
  await assert.rejects(recruitment.request.decide(1, "reject", 7, " ", false), /note is required/);
  for (const next of ["request spv/manager hr", "request director", "approve"]) {
    await recruitment.request.decide(1, "approve", 7, null, false);
    assert.equal(request.status, next);
  }
  await assert.rejects(recruitment.request.decide(1, "reject", 7, "x", false), /already approve/);
  await assert.rejects(recruitment.request.update(1, { reason: "x" }, 5, false), /cannot be edited while it is approve/);
  assert.deepEqual(requestProgress(progress),
    ["created", "approve hr staff", "approve spv/manager hr", "approve director"]);
});

test("Recruitment request can be rejected at any stage", async (t) => {
  const { progress } = mockStore(t);
  const request = await recruitment.request.create(requestBody, 5, false);
  await recruitment.request.decide(1, "approve", 7, null, false);
  await recruitment.request.decide(1, "reject", 8, "Budget belum ada", false);
  assert.equal(request.status, "reject");
  assert.deepEqual(progress.at(-1), ["request", 1, "reject spv/manager hr", "Budget belum ada"]);
  await assert.rejects(recruitment.request.decide(1, "approve", 8, null, false), /already reject/);
});

test("A request from the HR division skips the HR Staff approval", async (t) => {
  mockStore(t);
  const request = await recruitment.request.create(requestBody, 9, false);
  assert.equal(request.status, "request spv/manager hr");
  await recruitment.request.decide(1, "approve", 7, null, false);
  assert.equal(request.status, "request director");

  const hr = (division_code, division_name) => recruitment.isHrDivision({ division_code, division_name });
  for (const [code, name] of [["HR", "Human Resources"], ["hrd", "Personalia"], ["HRGA", "HR & GA"],
    ["PSN", "Human Resource Development"], ["X", "HR Department"]])
    assert.equal(hr(code, name), true, `${code} / ${name}`);
  for (const [code, name] of [["SLM", "Sales & Marketing"], ["GA", "General Affairs"], ["IFAT", "Internal FAT"]])
    assert.equal(hr(code, name), false, `${code} / ${name}`);
  assert.equal(recruitment.isHrDivision(null), false);
});

test("Every edit of a request, by anyone and at any approval stage, is kept as a revision", async (t) => {
  const { tables, progress } = mockStore(t);
  const request = await recruitment.request.create(requestBody, 5, false);
  await recruitment.request.update(1, { reason: "Karyawan resign akhir bulan" }, 5, false);
  await recruitment.request.update(1, { number_of_people: "3", reason: "Tambah shift malam", id_company: 1 }, 7, false);
  await recruitment.request.decide(1, "approve", 7, null, false);
  await recruitment.request.update(1, { request_type: "additional member" }, 8, false);
  await recruitment.request.decide(1, "approve", 7, null, false);
  assert.equal(request.status, "request director");
  await recruitment.request.update(1, { hiring_deadline: "2026-12-01" }, 8, false);
  assert.deepEqual(tables.RecruitmentRequestRevision.map((row) =>
    [row.revision_no, row.id_user, row.field, row.old_value, row.new_value]), [
    [1, 5, "reason", "Karyawan resign", "Karyawan resign akhir bulan"],
    [2, 7, "number_of_people", "2", "3"],
    [2, 7, "reason", "Karyawan resign akhir bulan", "Tambah shift malam"],
    [3, 8, "request_type", "replacement", "additional member"],
  ]);
  assert.deepEqual(progress.filter(([, , status]) => status === "revised").map(([, , , note]) => note), [
    "Recruitment request revised: reason",
    "Recruitment request revised: number_of_people, reason",
    "Recruitment request revised: request_type",
    "Recruitment request revised",
  ]);
  await assert.rejects(recruitment.request.update(1, { id_level: null }, 7, false), /id_level is required/);

  await recruitment.request.decide(1, "approve", 7, null, false);
  await assert.rejects(recruitment.request.update(1, { reason: "x" }, 7, false), /cannot be edited while it is approve/);
});

test("Hiring can be closed and reopened once the request is approved", async (t) => {
  const { progress } = mockStore(t);
  const request = await recruitment.request.create(requestBody, 5, false);
  request.hiring_status = "open";
  await assert.rejects(recruitment.request.setHiringStatus(1, "close", 7, null, false),
    /only be changed on an approved request, not request hr staff/);
  for (let i = 0; i < 3; i++) await recruitment.request.decide(1, "approve", 7, null, false);
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

test("A candidate applies to an approved, open request and copies its company, department, division, position and level", async (t) => {
  const { tables } = mockStore(t);
  addOpenRequest(tables);
  addOpenRequest(tables, { hiring_status: "close" });
  addOpenRequest(tables, { status: "request director" });
  addOpenRequest(tables, { id_company: 2, id_department: 4, id_division: 5, id_position: 7, id_level: 2 });

  await assert.rejects(recruitment.candidate.create({ name: "Budi" }, 5, false), /id_recruitment_request is required/);
  await assert.rejects(recruitment.candidate.create({ id_recruitment_request: 99, name: "Budi" }, 5, false),
    /Recruitment request not found/);
  await assert.rejects(recruitment.candidate.create({ id_recruitment_request: 2, name: "Budi" }, 5, false),
    /hiring is closed/);
  await assert.rejects(recruitment.candidate.create({ id_recruitment_request: 3, name: "Budi" }, 5, false),
    /is request director, not approved yet/);
  await assert.rejects(recruitment.candidate.create({ id_recruitment_request: 1, name: "Budi", email: "budi@" }, 5, false),
    /email must be a valid email address/);

  const candidate = await recruitment.candidate.create({
    id_recruitment_request: 1, name: "Budi", phone_number: "0812-3456-7890", email: "budi@example.com",
    hr_interview_meeting_room: "Ruang Meeting 2", hr_interview_meeting_room_link: "https://meet.google.com/abc-defg-hij",
    // Ignored: these always come from the request.
    id_company: 9, id_position: 9,
  }, 5, false);
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

test("Candidate goes through HR interview, user interview, offering and contract in order", async (t) => {
  const { tables } = mockStore(t);
  addOpenRequest(tables);
  const candidate = await recruitment.candidate.create({
    id_recruitment_request: 1, name: "Budi", job_title: "Staff", source: "JobStreet",
    hr_interview_mechanism: "Online", hr_interview_date: "2026-10-21", hr_interview_time: "09:00",
  }, 5, false);
  assert.equal(candidate.status, "pending");
  await assert.rejects(recruitment.candidate.create({ id_recruitment_request: 1, name: "X", hr_interview_time: "9 pagi" }, 5, false),
    /HH:MM/);
  await assert.rejects(recruitment.hrInterview.create({ id_recruitment_candidate: 1, decision: "passed" }, 5, false),
    /candidate has not been approved/);
  await recruitment.candidate.decide(1, "approve", 7, null, false);

  await assert.rejects(recruitment.userInterview.create({ id_recruitment_candidate: 1, decision: "accepted" }, 5, false),
    /needs an approved HR interview that passed/);
  await assert.rejects(recruitment.hrInterview.create({ id_recruitment_candidate: 1, decision: "maybe" }, 5, false),
    /decision must be one of: passed, not passed/);
  await recruitment.hrInterview.create({
    id_recruitment_candidate: 1, decision: "passed", interview_result: "Komunikatif", work_system: "WFO",
    user_interview_mechanism: "Onsite", user_interview_date: "2026-10-25", user_interview_time: "13:30",
  }, 5, false);
  assert.equal(tables.RecruitmentHrInterview[0].candidate_name, "Budi");
  assert.deepEqual([candidate.user_interview_mechanism, candidate.user_interview_date, candidate.user_interview_time],
    ["Onsite", "2026-10-25", "13:30"]);
  await assert.rejects(recruitment.hrInterview.create({ id_recruitment_candidate: 1, decision: "passed" }, 5, false),
    /already has a pending hr interview/);
  await assert.rejects(recruitment.userInterview.create({ id_recruitment_candidate: 1, decision: "accepted" }, 5, false),
    /needs an approved HR interview/);
  await recruitment.hrInterview.decide(1, "approve", 7, null, false);

  // HR reschedules the user interview on the candidate, even after approval.
  await recruitment.candidate.update(1, { user_interview_date: "2026-10-26", name: "Budi Santoso" }, 5, false);
  assert.equal(candidate.user_interview_date, "2026-10-26");
  assert.equal(tables.RecruitmentHrInterview[0].candidate_name, "Budi Santoso");

  await assert.rejects(recruitment.userInterview.create({ id_recruitment_candidate: 1, decision: "accepted" }, 5, false),
    /active_work_date is required when accepted/);
  await recruitment.userInterview.create({
    id_recruitment_candidate: 1, decision: "accepted", assessment: "Baik", recommended_salary: 6000000,
    recommended_benefit: "BPJS", active_work_date: "2026-11-02",
  }, 5, false);
  await assert.rejects(recruitment.offering.create({ id_recruitment_candidate: 1 }, 5, false), /needs an approved user interview/);
  await recruitment.userInterview.decide(1, "approve", 7, null, false);

  const offering = await recruitment.offering.create({ id_recruitment_candidate: 1, birth_place: "Bandung",
    birth_date: "2000-01-15", address: "Jl. Merdeka 1" }, 5, false);
  assert.deepEqual([offering.job_title, offering.id_department, offering.effective_date, offering.salary, offering.benefit],
    ["Staff", 3, "2026-11-02", 6000000, "BPJS"]);
  await assert.rejects(recruitment.contract.create({ id_recruitment_candidate: 1 }, 5, false), /needs an approved offering letter/);
  await recruitment.offering.decide(1, "approve", 7, null, false);

  const contract = await recruitment.contract.create({ id_recruitment_candidate: 1, nik: "3201", gender: "Male",
    contract_type: "PKWT", contract_duration: "12 bulan", end_date: "2027-11-01", id_employee_supervisor: 4 }, 5, false);
  assert.deepEqual([contract.candidate_name, contract.birth_place, contract.address, contract.salary, contract.job_title],
    ["Budi Santoso", "Bandung", "Jl. Merdeka 1", 6000000, "Staff"]);
  await recruitment.contract.decide(1, "approve", 7, null, false);
  assert.equal(contract.status, "approve");
});

test("A rejected step can be created again; a not accepted user interview clears the offer fields", async (t) => {
  const { tables } = mockStore(t);
  addOpenRequest(tables);
  await recruitment.candidate.create({ id_recruitment_request: 1, name: "Sari" }, 5, false);
  await recruitment.candidate.decide(1, "approve", 7, null, false);
  await recruitment.hrInterview.create({ id_recruitment_candidate: 1, decision: "not passed" }, 5, false);
  await recruitment.hrInterview.decide(1, "reject", 7, "Hasil psikotes belum dilampirkan", false);
  await recruitment.hrInterview.create({ id_recruitment_candidate: 1, decision: "passed" }, 5, false);
  assert.equal(tables.RecruitmentHrInterview.length, 2);
  await recruitment.hrInterview.decide(2, "approve", 7, null, false);

  await recruitment.userInterview.create({ id_recruitment_candidate: 1, decision: "not accepted",
    recommended_salary: 5000000, active_work_date: "2026-11-01" }, 5, false);
  assert.deepEqual([tables.RecruitmentUserInterview[0].recommended_salary, tables.RecruitmentUserInterview[0].active_work_date],
    [null, null]);
  await recruitment.userInterview.decide(1, "approve", 7, null, false);
  await assert.rejects(recruitment.offering.create({ id_recruitment_candidate: 1 }, 5, false), /user interview that accepted/);
});
