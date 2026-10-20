const test = require("node:test");
const assert = require("node:assert/strict");
const recruitment = require("../src/services/humanResource/recruitment/recruitment.service");
const { models, db1 } = require("../src/models");

const modelNames = [
  "RecruitmentRequest", "RecruitmentCandidate", "RecruitmentHrInterview", "RecruitmentUserInterview",
  "RecruitmentOffering", "RecruitmentContract",
];

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
    );
  }
  replaced.push([models.db1.RecruitmentVerificationProgress, "create", async (data) => {
    progress.push([data.module, data.id_document, data.status]);
    return data;
  }]);
  for (const service of Object.values(recruitment.services))
    replaced.push([service, "getById", async (id) => tables[service.config.modelName].find((row) => row.id === Number(id))]);
  const originals = replaced.map(([target, key]) => [target, key, target[key]]);
  t.after(() => { for (const [target, key, value] of originals) target[key] = value; });
  for (const [target, key, value] of replaced) target[key] = value;
  return { tables, progress };
}

test("Recruitment request is created pending and approved or rejected once", async (t) => {
  const { progress } = mockStore(t);
  await assert.rejects(recruitment.request.create({ id_position: 2 }, 5, false), /job_title is required/);
  const request = await recruitment.request.create(
    { job_title: "Staff", id_position: 2, job_recruitment: "2 orang", job_description: "Admin gudang" }, 5, false);
  assert.equal(request.status, "pending");
  assert.equal(request.id_user_request, 5);
  await assert.rejects(recruitment.request.decide(1, "reject", 7, " ", false), /note is required/);
  await recruitment.request.decide(1, "approve", 7, null, false);
  assert.equal(request.status, "approve");
  await assert.rejects(recruitment.request.decide(1, "reject", 7, "x", false), /already approve/);
  await assert.rejects(recruitment.request.update(1, { job_title: "SPV" }, 5, false), /cannot be edited while it is approve/);
  assert.deepEqual(progress, [["request", 1, "created"], ["request", 1, "approve"]]);
});

test("Candidate goes through HR interview, user interview, offering and contract in order", async (t) => {
  const { tables } = mockStore(t);
  const candidate = await recruitment.candidate.create({
    name: "Budi", job_title: "Staff", id_position: 2, id_department: 3, source: "JobStreet",
    hr_interview_mechanism: "Online", hr_interview_date: "2026-10-21", hr_interview_time: "09:00",
  }, 5, false);
  assert.equal(candidate.status, "pending");
  await assert.rejects(recruitment.candidate.create({ name: "X", hr_interview_time: "9 pagi" }, 5, false), /HH:MM/);
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
  await recruitment.candidate.create({ name: "Sari" }, 5, false);
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
