const { models, fail, withTransactions, mirrorUpdate } = require("../../procurement/shared");
const { RecruitmentDocumentService, check } = require("./recruitmentDocument.service");
const {
  REQUEST_TYPES,
  HIRING_STATUSES,
} = require("../../../models/humanResource/recruitment/recruitmentRequest.model");

const today = () => new Date().toISOString().slice(0, 10);
const activeStatuses = ["pending", "approve"];

// Steps after the candidate database, in order. A step can be created for a
// candidate only when the candidate is approved, the previous step has an approved
// document matching `previous.where`, and the step has no pending/approved document yet.
const STAGES = {
  "hr interview": { modelName: "RecruitmentHrInterview", as: "hr_interviews" },
  "user interview": {
    modelName: "RecruitmentUserInterview",
    as: "user_interviews",
    previous: { stage: "hr interview", where: { decision: "passed" }, label: "an approved HR interview that passed" },
  },
  offering: {
    modelName: "RecruitmentOffering",
    as: "offerings",
    previous: { stage: "user interview", where: { decision: "accepted" }, label: "an approved user interview that accepted" },
  },
  contract: {
    modelName: "RecruitmentContract",
    as: "contracts",
    previous: { stage: "offering", where: {}, label: "an approved offering letter" },
  },
};

// Locks the candidate and checks it may enter `stage`; returns the candidate and
// the approved document of the previous step (used for defaults).
async function enterStage(stage, candidateId, t1) {
  check.required({ id_recruitment_candidate: candidateId }, "id_recruitment_candidate");
  check.id({ id_recruitment_candidate: candidateId }, "id_recruitment_candidate");
  const candidate = await models.db1.RecruitmentCandidate.findOne({
    where: { id: candidateId, is_active: true },
    transaction: t1,
    lock: t1.LOCK.UPDATE,
  });
  if (!candidate) fail("Recruitment candidate not found", 404);
  if (candidate.status !== "approve") fail("Recruitment candidate has not been approved yet", 409);
  const rule = STAGES[stage];
  let previous = null;
  if (rule.previous) {
    previous = await models.db1[STAGES[rule.previous.stage].modelName].findOne({
      where: { id_recruitment_candidate: candidate.id, is_active: true, status: "approve", ...rule.previous.where },
      order: [["id", "DESC"]],
      transaction: t1,
    });
    if (!previous) fail(`Candidate needs ${rule.previous.label} first`, 409);
  }
  const current = await models.db1[rule.modelName].findOne({
    where: { id_recruitment_candidate: candidate.id, is_active: true, status: activeStatuses },
    transaction: t1,
  });
  if (current) fail(`Candidate already has a ${current.status} ${stage}`, 409);
  return { candidate, previous };
}

const position = () => ({ model: models.db1.Position, as: "position", attributes: ["id", "position_name"] });
const department = () => ({
  model: models.db1.Department,
  as: "department",
  attributes: ["id", "department_name"],
});
const company = () => ({ model: models.db1.Company, as: "company", attributes: ["id", "company_name"] });
const division = () => ({
  model: models.db1.Division,
  as: "division",
  attributes: ["id", "division_name", "division_code"],
});
const level = () => ({ model: models.db1.Level, as: "level", attributes: ["id", "level_name"] });
const candidateInclude = () => ({
  model: models.db1.RecruitmentCandidate,
  as: "candidate",
  attributes: ["id", "id_recruitment_request", "name", "job_title", "id_position", "id_department", "status"],
});

// The HR division is recognised by its code or name, e.g. "HR", "HRD", "HRGA",
// "Human Resources" or "HR & GA", so a renamed division still matches.
function isHrDivision(division) {
  if (!division) return false;
  const code = String(division.division_code ?? "").toUpperCase();
  const name = String(division.division_name ?? "");
  return code.includes("HR") || /human\s*resource/i.test(name) || /\bHR/i.test(name);
}

async function isHrUser(userId, t1) {
  const user = await models.db1.User.findByPk(userId, {
    attributes: ["id", "id_division"],
    include: [{ model: models.db1.Division, as: "division", attributes: ["division_code", "division_name"] }],
    transaction: t1,
  });
  return isHrDivision(user?.division);
}

const requestMasterIds = ["id_company", "id_department", "id_division", "id_position", "id_level"];

const request = new RecruitmentDocumentService({
  module: "request",
  modelName: "RecruitmentRequest",
  label: "Recruitment request",
  fields: [
    ...requestMasterIds, "number_of_people", "job_requirement", "job_description", "request_type",
    "reason", "hiring_deadline", "hiring_status",
  ],
  includes: () => [
    company(),
    department(),
    division(),
    position(),
    level(),
    {
      model: models.db1.RecruitmentRequestRevision,
      as: "revisions",
      separate: true,
      order: [["revision_no", "ASC"], ["id", "ASC"]],
      include: [{ model: models.db1.User, as: "user", attributes: ["id", "name"] }],
    },
  ],
  // Editable by anyone at every approval stage; every edit is kept in revisions.
  editableStatuses: ["request hr staff", "request spv/manager hr", "request director"],
  revisions: { modelName: "RecruitmentRequestRevision", foreignKey: "id_recruitment_request" },
  approvalStages: {
    "request hr staff": { by: "hr staff", next: "request spv/manager hr" },
    "request spv/manager hr": { by: "spv/manager hr", next: "request director" },
    "request director": { by: "director", next: "approve" },
  },
  // Created straight to HR Staff; a request from the HR division skips that stage.
  async initialStatus(data, userId, t1) {
    return (await isHrUser(userId, t1)) ? "request spv/manager hr" : "request hr staff";
  },
  async prepare(data, existing) {
    for (const key of [...requestMasterIds, "number_of_people", "request_type"])
      if (!existing || data[key] !== undefined) check.required(data, key);
    for (const key of requestMasterIds) check.id(data, key);
    check.positiveInteger(data, "number_of_people");
    if (data.request_type != null) check.oneOf(data, "request_type", REQUEST_TYPES);
    check.date(data, "hiring_deadline");
    if (data.hiring_status === null) fail("hiring_status is required");
    if (data.hiring_status !== undefined) check.oneOf(data, "hiring_status", HIRING_STATUSES);
    return data;
  },
});

// Opens or closes hiring on an approved request; recorded in its progress.
request.setHiringStatus = async function setHiringStatus(id, hiringStatus, userId, note, isDoubleDatabase = true) {
  check.oneOf({ hiring_status: hiringStatus }, "hiring_status", HIRING_STATUSES);
  await withTransactions(isDoubleDatabase, async (t1, t2) => {
    const doc = await this.lock(id, t1);
    if (doc.status !== "approve")
      fail(`Hiring status can only be changed on an approved request, not ${doc.status}`, 409);
    if (doc.hiring_status === hiringStatus) fail(`Hiring is already ${hiringStatus}`, 409);
    await mirrorUpdate("RecruitmentRequest", doc.id, { hiring_status: hiringStatus }, t1, t2);
    await this.addProgress(doc.id, userId, `hiring ${hiringStatus}`, note, t1, t2);
  });
  return this.getById(id);
};

const stepIncludes = () => {
  const db = models.db1;
  const files = (category) => ({ model: db.File, as: category, required: false, where: { is_active: true } });
  const latestFirst = { separate: true, order: [["id", "DESC"]], where: { is_active: true } };
  return [
    { model: db.RecruitmentHrInterview, as: "hr_interviews", ...latestFirst, include: [files("files_attachment")] },
    { model: db.RecruitmentUserInterview, as: "user_interviews", ...latestFirst },
    {
      model: db.RecruitmentOffering,
      as: "offerings",
      ...latestFirst,
      include: ["files_offering_letter", "files_ktp", "files_npwp"].map(files),
    },
    { model: db.RecruitmentContract, as: "contracts", ...latestFirst },
  ];
};

// Locks in the recruitment request a candidate applies to: it must be approved and
// still hiring.
async function openRequest(id, t1) {
  check.id({ id_recruitment_request: id }, "id_recruitment_request");
  const row = await models.db1.RecruitmentRequest.findOne({ where: { id, is_active: true }, transaction: t1 });
  if (!row) fail("Recruitment request not found", 404);
  if (row.status !== "approve") fail(`Recruitment request is ${row.status}, not approved yet`, 409);
  if (row.hiring_status !== "open") fail("Recruitment request hiring is closed", 409);
  return row;
}

const candidate = new RecruitmentDocumentService({
  module: "candidate",
  modelName: "RecruitmentCandidate",
  label: "Recruitment candidate",
  // Company, department, division, position and level are not taken from the body:
  // they are copied from the chosen recruitment request.
  fields: [
    "id_recruitment_request", "name", "phone_number", "email", "job_title", "source", "disc",
    "recruitment_process", "hr_interview_mechanism", "hr_interview_date", "hr_interview_time",
    "hr_interview_meeting_room", "hr_interview_meeting_room_link",
    "user_interview_mechanism", "user_interview_date", "user_interview_time",
  ],
  fileableType: "recruitment_candidates",
  fileCategories: ["files_cv", "files_application_form"],
  // HR can always edit a candidate, e.g. to reschedule an interview.
  editableStatuses: null,
  includes: () => [
    {
      model: models.db1.RecruitmentRequest,
      as: "recruitment_request",
      attributes: ["id", "status", "hiring_status", "number_of_people", "hiring_deadline", "request_type"],
    },
    company(), department(), division(), position(), level(), ...stepIncludes(),
  ],
  async prepare(data, existing, t1) {
    for (const key of ["id_recruitment_request", "name"])
      if (!existing || data[key] !== undefined) check.required(data, key);
    // A new or changed request copies its master data onto the candidate.
    if (
      data.id_recruitment_request !== undefined &&
      Number(data.id_recruitment_request) !== existing?.id_recruitment_request
    ) {
      const row = await openRequest(data.id_recruitment_request, t1);
      for (const key of requestMasterIds) data[key] = row[key];
    }
    if (data.email != null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      fail("email must be a valid email address");
    for (const key of ["hr_interview_date", "user_interview_date"]) check.date(data, key);
    for (const key of ["hr_interview_time", "user_interview_time"]) check.time(data, key);
    return data;
  },
  // Keeps the candidate name copied on every step in line with the candidate.
  async afterSave(doc, input, userId, t1, t2, existing) {
    if (!existing || doc.name === existing.name) return;
    for (const { modelName } of Object.values(STAGES)) {
      const rows = await models.db1[modelName].findAll({
        attributes: ["id"],
        where: { id_recruitment_candidate: doc.id },
        transaction: t1,
      });
      for (const row of rows) await mirrorUpdate(modelName, row.id, { candidate_name: doc.name }, t1, t2);
    }
  },
});

// The HR interview form also sets the user interview schedule, which is stored on
// the candidate so HR can reschedule it there.
const userScheduleFields = ["user_interview_mechanism", "user_interview_date", "user_interview_time"];

const hrInterview = new RecruitmentDocumentService({
  module: "hr interview",
  modelName: "RecruitmentHrInterview",
  label: "HR interview",
  fields: ["psychotest_result", "interview_result", "decision", "work_system", "salary"],
  createOnly: ["id_recruitment_candidate"],
  fileableType: "recruitment_hr_interviews",
  fileCategories: ["files_attachment"],
  includes: () => [candidateInclude()],
  async prepare(data, existing, t1) {
    if (!existing) {
      const { candidate: row } = await enterStage("hr interview", data.id_recruitment_candidate, t1);
      data.candidate_name = row.name;
    }
    if (!existing || data.decision !== undefined) check.oneOf(data, "decision", ["passed", "not passed"]);
    return data;
  },
  async afterSave(doc, input, userId, t1, t2) {
    if (doc.decision !== "passed") return;
    const schedule = Object.fromEntries(
      userScheduleFields.filter((key) => input[key] !== undefined).map((key) => [key, input[key] || null]),
    );
    if (!Object.keys(schedule).length) return;
    check.date(schedule, "user_interview_date");
    check.time(schedule, "user_interview_time");
    await mirrorUpdate("RecruitmentCandidate", doc.id_recruitment_candidate, schedule, t1, t2);
  },
});

const userInterview = new RecruitmentDocumentService({
  module: "user interview",
  modelName: "RecruitmentUserInterview",
  label: "User interview",
  fields: ["assessment", "decision", "recommended_salary", "recommended_benefit", "active_work_date"],
  createOnly: ["id_recruitment_candidate"],
  includes: () => [candidateInclude()],
  async prepare(data, existing, t1) {
    if (!existing) {
      const { candidate: row } = await enterStage("user interview", data.id_recruitment_candidate, t1);
      data.candidate_name = row.name;
    }
    const decision = data.decision ?? existing?.decision;
    check.oneOf({ decision }, "decision", ["accepted", "not accepted"]);
    check.amount(data, "recommended_salary");
    check.date(data, "active_work_date");
    if (decision === "accepted") {
      if (!(data.active_work_date ?? existing?.active_work_date)) fail("active_work_date is required when accepted");
    } else Object.assign(data, { recommended_salary: null, recommended_benefit: null, active_work_date: null });
    return data;
  },
});

const offering = new RecruitmentDocumentService({
  module: "offering",
  modelName: "RecruitmentOffering",
  label: "Offering letter",
  fields: [
    "offering_date", "birth_place", "birth_date", "address", "job_title", "id_department",
    "effective_date", "salary", "benefit",
  ],
  createOnly: ["id_recruitment_candidate"],
  fileableType: "recruitment_offerings",
  fileCategories: ["files_offering_letter", "files_ktp", "files_npwp"],
  includes: () => [candidateInclude(), department()],
  async prepare(data, existing, t1) {
    if (!existing) {
      const { candidate: row, previous } = await enterStage("offering", data.id_recruitment_candidate, t1);
      data.candidate_name = row.name;
      data.job_title ??= row.job_title;
      data.id_department ??= row.id_department;
      data.offering_date ??= today();
      data.effective_date ??= previous.active_work_date;
      data.salary ??= previous.recommended_salary;
      data.benefit ??= previous.recommended_benefit;
    }
    if (!existing || data.effective_date !== undefined) check.required(data, "effective_date");
    for (const key of ["offering_date", "birth_date", "effective_date"]) check.date(data, key);
    check.id(data, "id_department");
    check.amount(data, "salary");
    return data;
  },
});

const contract = new RecruitmentDocumentService({
  module: "contract",
  modelName: "RecruitmentContract",
  label: "Employment contract",
  fields: [
    "contract_date", "gender", "birth_place", "birth_date", "address", "nik", "job_title", "id_department",
    "id_employee_supervisor", "salary", "contract_type", "contract_duration", "end_date",
  ],
  createOnly: ["id_recruitment_candidate"],
  includes: () => [
    candidateInclude(),
    department(),
    { model: models.db1.Employee, as: "supervisor", attributes: ["id", "employee_code", "full_name"] },
  ],
  async prepare(data, existing, t1) {
    if (!existing) {
      const { candidate: row, previous } = await enterStage("contract", data.id_recruitment_candidate, t1);
      data.candidate_name = row.name;
      for (const key of ["birth_place", "birth_date", "address", "job_title", "id_department", "salary"])
        data[key] ??= previous[key];
      data.contract_date ??= today();
    }
    for (const key of ["contract_date", "birth_date", "end_date"]) check.date(data, key);
    for (const key of ["id_department", "id_employee_supervisor"]) check.id(data, key);
    check.amount(data, "salary");
    return data;
  },
});

const services = { request, candidate, hrInterview, userInterview, offering, contract };

// Approved candidates that may enter `stage` now, for the candidate dropdown of
// each step form. Each row carries previous_step: the approved document of the
// previous step, to prefill the form.
async function candidateOptions(stage) {
  const rule = STAGES[stage];
  if (!rule) fail(`stage must be one of: ${Object.keys(STAGES).join(", ")}`);
  const db = models.db1;
  const include = [
    { model: db[rule.modelName], as: rule.as, attributes: ["id", "status"], where: { is_active: true }, required: false },
    position(),
    department(),
  ];
  if (rule.previous) {
    const previous = STAGES[rule.previous.stage];
    include.push({
      model: db[previous.modelName],
      as: previous.as,
      required: true,
      where: { is_active: true, status: "approve", ...rule.previous.where },
    });
  }
  const rows = await db.RecruitmentCandidate.findAll({
    where: { is_active: true, status: "approve" },
    include,
    order: [["name", "ASC"]],
  });
  return rows
    .map((row) => row.toJSON())
    .filter((row) => !row[rule.as].some((doc) => activeStatuses.includes(doc.status)))
    .map(({ [rule.as]: current, ...row }) => {
      if (!rule.previous) return row;
      const previousAs = STAGES[rule.previous.stage].as;
      const { [previousAs]: previous, ...rest } = row;
      return { ...rest, previous_step: [...previous].sort((a, b) => b.id - a.id)[0] };
    });
}

module.exports = { ...services, services, candidateOptions, STAGES, enterStage, isHrDivision };
