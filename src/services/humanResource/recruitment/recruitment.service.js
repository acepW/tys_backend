const {
  models,
  fail,
  withTransactions,
  mirrorCreate,
  mirrorUpdate,
  syncFiles,
  nextCompanyNo,
} = require("../../procurement/shared");
const { RecruitmentDocumentService, check, revisionValue } = require("./recruitmentDocument.service");
const reportItemService = require("./reportItem.service");
const {
  INTERVIEW_METHODS,
  ATTENDANCES,
  HR_RECOMMENDATIONS,
} = require("../../../models/humanResource/recruitment/recruitmentHrInterview.model");
const { USER_DECISIONS } = require("../../../models/humanResource/recruitment/recruitmentUserInterview.model");
const approvalAccess = require("../../approvalFlow/approvalAccess.service");
const org = require("../../orgHierarchy");
const {
  REQUEST_TYPES,
  HIRING_STATUSES,
  RETURNED_TO_REQUESTER,
} = require("../../../models/humanResource/recruitment/recruitmentRequest.model");
const {
  LICENSE_TYPES,
  CANDIDATE_HIRING_STATUSES,
} = require("../../../models/humanResource/recruitment/recruitmentCandidate.model");

const today = () => new Date().toISOString().slice(0, 10);
const activeStatuses = ["pending", "approve"];

// Steps after the candidate database, in order. A step can be created for an
// active candidate only when the previous step has a document matching
// `previous.where`, and the step has no document in one of its `active` statuses
// (default pending/approve). Candidates have no approval since 2026-11-18; the HR
// interview has none since 2026-11-24: it is scheduled, then completed (or no show,
// after which HR may schedule another one, H16).
const STAGES = {
  "hr interview": {
    modelName: "RecruitmentHrInterview",
    as: "hr_interviews",
    active: ["scheduled", "completed", "pending", "approve"],
  },
  "user interview": {
    modelName: "RecruitmentUserInterview",
    as: "user_interviews",
    active: ["scheduled", "completed", "pending", "approve"],
    previous: {
      stage: "hr interview",
      where: { status: "completed", recommendation: "recommended" },
      label: "an HR interview that recommended the candidate",
    },
  },
  offering: {
    modelName: "RecruitmentOffering",
    as: "offerings",
    previous: {
      stage: "user interview",
      where: { status: "completed", result: "accepted" },
      label: "a user interview that accepted the candidate",
    },
  },
  contract: {
    modelName: "RecruitmentContract",
    as: "contracts",
    previous: { stage: "offering", where: { status: "approve" }, label: "an approved offering letter" },
  },
};
const activeOf = (rule) => rule.active || activeStatuses;

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
  const rule = STAGES[stage];
  let previous = null;
  if (rule.previous) {
    previous = await models.db1[STAGES[rule.previous.stage].modelName].findOne({
      where: { id_recruitment_candidate: candidate.id, is_active: true, ...rule.previous.where },
      order: [["id", "DESC"]],
      transaction: t1,
    });
    if (!previous) fail(`Candidate needs ${rule.previous.label} first`, 409);
  }
  const current = await models.db1[rule.modelName].findOne({
    where: { id_recruitment_candidate: candidate.id, is_active: true, status: activeOf(rule) },
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
// Who created a candidate (HR PIC), shown wherever the candidate is.
const candidateCreator = () => ({ model: models.db1.User, as: "user_request", attributes: ["id", "name", "email"] });
const candidateInclude = () => ({
  model: models.db1.RecruitmentCandidate,
  as: "candidate",
  attributes: ["id", "id_recruitment_request", "name", "job_title", "id_position", "id_department", "id_user_request"],
  include: [candidateCreator()],
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

// What each approval stage may change; the requester changes everything while the
// request is returned to them. Manager HR and Director stages change nothing.
const stageEditableFields = {
  "request hr staff": ["hard_skill", "soft_skill", "other_requirement", "job_description"],
  "request spv hr": ["salary_min", "salary_max"],
};
const firstStage = async (userId, t1) =>
  (await isHrUser(userId, t1)) ? "request spv hr" : "request hr staff";

// REC-<company initial>-MM-YYYY-0001 of the company the request is for.
async function nextRequestNo(idCompany, t1) {
  const company = await models.db1.Company.findOne({
    where: { id: idCompany },
    attributes: ["initial_company"],
    transaction: t1,
  });
  if (!company) fail("Company not found", 404);
  const initial = String(company.initial_company || "").trim().toUpperCase();
  if (!initial) fail("The company has no initial for the request number");
  return nextCompanyNo("RecruitmentRequest", "request_no", "REC", initial, t1);
}

const request = new RecruitmentDocumentService({
  module: "request",
  modelName: "RecruitmentRequest",
  label: "Recruitment request",
  // job_requirement is no longer accepted: it is split into hard_skill, soft_skill
  // and other_requirement. request_no is set on create.
  fields: [
    ...requestMasterIds, "number_of_people", "current_division_member", "hard_skill", "soft_skill",
    "other_requirement", "job_description", "salary_min", "salary_max", "request_type", "reason",
    "hiring_deadline", "hiring_status",
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
  // Every edit is kept in revisions (before/after). See checkEdit for who edits what.
  editableStatuses: [RETURNED_TO_REQUESTER, ...Object.keys(stageEditableFields)],
  revisions: { modelName: "RecruitmentRequestRevision", foreignKey: "id_recruitment_request" },
  approvalStages: {
    "request hr staff": {
      by: "hr staff",
      next: "request spv hr",
      rejectTo: { requester: RETURNED_TO_REQUESTER },
    },
    "request spv hr": {
      by: "spv hr",
      next: "request manager hr",
      rejectTo: { "hr staff": "request hr staff", requester: RETURNED_TO_REQUESTER },
    },
    "request manager hr": {
      by: "manager hr",
      next: "request director",
      rejectTo: { "spv hr": "request spv hr", requester: RETURNED_TO_REQUESTER },
    },
    "request director": {
      by: "director",
      next: "approve",
      rejectTo: { "spv hr": "request spv hr", requester: RETURNED_TO_REQUESTER },
    },
  },
  // Created straight to HR Staff; a request from the HR division skips that stage.
  async initialStatus(data, userId, t1) {
    return firstStage(userId, t1);
  },
  // A returned request is edited by its requester only. At an approval stage, its
  // approver (approval flow) changes only that stage's fields; other fields sent
  // unchanged are dropped, changed ones are refused.
  async checkEdit(existing, data, userId) {
    if (existing.status === RETURNED_TO_REQUESTER) {
      if (Number(existing.id_user_request) !== Number(userId))
        fail("Only the requester can edit a request returned to them", 403);
      return;
    }
    const allowed = stageEditableFields[existing.status];
    const changed = Object.keys(data).filter(
      (key) => !allowed.includes(key) && revisionValue(existing[key]) !== revisionValue(data[key]),
    );
    if (changed.length)
      fail(
        `Only ${allowed.join(", ")} can be edited while the request is ${existing.status} (changed: ${changed.join(", ")})`,
      );
    for (const key of Object.keys(data)) if (!allowed.includes(key)) delete data[key];
    await approvalAccess.authorize("recruitment request", existing.id, userId, [existing.status]);
  },
  async prepare(data, existing, t1) {
    for (const key of [...requestMasterIds, "number_of_people", "current_division_member", "request_type"])
      if (!existing || data[key] !== undefined) check.required(data, key);
    for (const key of requestMasterIds) check.id(data, key);
    // Department, division and position must fit together (candidates copy them).
    if (org.changesPlacement(data, existing))
      await org.assertPlacement(org.mergePlacement(data, existing), existing);
    check.positiveInteger(data, "number_of_people");
    check.nonNegativeInteger(data, "current_division_member");
    if (data.request_type != null) check.oneOf(data, "request_type", REQUEST_TYPES);
    check.date(data, "hiring_deadline");
    if (data.hiring_status === null) fail("hiring_status is required");
    if (data.hiring_status !== undefined) check.oneOf(data, "hiring_status", HIRING_STATUSES);
    for (const key of ["salary_min", "salary_max"]) check.amount(data, key);
    const salary = (key) => (data[key] !== undefined ? data[key] : existing?.[key]);
    if (salary("salary_min") != null && salary("salary_max") != null
      && Number(salary("salary_min")) > Number(salary("salary_max")))
      fail("salary_min cannot be more than salary_max");
    if (!existing) data.request_no = await nextRequestNo(data.id_company, t1);
    return data;
  },
});

// The requester submits a request returned to them again, to its first stage.
request.resubmit = async function resubmit(id, userId, note, isDoubleDatabase = true) {
  await withTransactions(isDoubleDatabase, async (t1, t2) => {
    const doc = await this.lock(id, t1);
    if (doc.status !== RETURNED_TO_REQUESTER)
      fail(`Only a request returned to the requester can be resubmitted, not ${doc.status}`, 409);
    if (Number(doc.id_user_request) !== Number(userId))
      fail("Only the requester can resubmit the request", 403);
    const status = await firstStage(doc.id_user_request, t1);
    await mirrorUpdate("RecruitmentRequest", doc.id, { status }, t1, t2);
    await this.addProgress(doc.id, userId, "resubmitted", note, t1, t2);
  });
  return this.getById(id);
};

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
    {
      model: db.RecruitmentHrInterview,
      as: "hr_interviews",
      ...latestFirst,
      include: [
        files("files_attachment"),
        { model: db.User, as: "user_request", attributes: ["id", "name"] },
        { model: db.User, as: "interviewer", attributes: ["id", "name"] },
      ],
    },
    {
      model: db.RecruitmentUserInterview,
      as: "user_interviews",
      ...latestFirst,
      include: [
        { model: db.User, as: "user_request", attributes: ["id", "name"] },
        {
          model: db.RecruitmentUserInterviewer,
          as: "interviewers",
          separate: true,
          where: { is_active: true },
          order: [["interview_date", "ASC"], ["interview_time", "ASC"], ["id", "ASC"]],
          include: [{ model: db.User, as: "user", attributes: ["id", "name"] }],
        },
      ],
    },
    {
      model: db.RecruitmentOffering,
      as: "offerings",
      ...latestFirst,
      include: ["files_offering_letter", "files_ktp", "files_npwp"].map(files),
    },
    { model: db.RecruitmentContract, as: "contracts", ...latestFirst },
  ];
};

// Professional certification/license of a candidate: required yes/no on create;
// with yes, one license type (and its text when "other"); with no, no type.
// Candidates from before it was added have none until it is set.
function checkLicense(data, existing) {
  const value = (key) => (data[key] !== undefined ? data[key] : existing?.[key]);
  if (!existing || data.has_professional_license !== undefined)
    if (typeof data.has_professional_license !== "boolean")
      fail("has_professional_license must be true or false");
  const hasLicense = value("has_professional_license");
  if (hasLicense === true) {
    check.oneOf({ license_type: value("license_type") }, "license_type", LICENSE_TYPES);
    if (value("license_type") === "other") {
      if (!String(value("license_type_other") ?? "").trim())
        fail("license_type_other is required when license_type is other");
    } else data.license_type_other = null;
  } else if (hasLicense === false) {
    Object.assign(data, { license_type: null, license_type_other: null });
  } else if (data.license_type != null || data.license_type_other != null) {
    fail("has_professional_license is required to set a license type");
  }
}

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

/**
 * Sets a candidate's hiring status and records it in the candidate's history
 * (docs/recruitment-interview-requirement.md, bagian 2). Used by hand (any value,
 * H1) and by the interviews. Returns false when the status is already that one.
 */
async function setCandidateHiringStatus(candidateId, hiringStatus, userId, note, t1, t2) {
  check.oneOf({ hiring_status: hiringStatus }, "hiring_status", CANDIDATE_HIRING_STATUSES);
  const row = await models.db1.RecruitmentCandidate.findOne({
    where: { id: candidateId, is_active: true },
    attributes: ["id", "hiring_status"],
    transaction: t1,
    lock: t1.LOCK.UPDATE,
  });
  if (!row) fail("Recruitment candidate not found", 404);
  if (row.hiring_status === hiringStatus) return false;
  await mirrorUpdate(
    "RecruitmentCandidate",
    row.id,
    { hiring_status: hiringStatus, hiring_status_updated_at: new Date() },
    t1,
    t2,
  );
  await mirrorCreate(
    "RecruitmentVerificationProgress",
    {
      module: "candidate",
      id_document: row.id,
      id_user: userId,
      status: `hiring status ${hiringStatus}`,
      note: [`Hiring status ${row.hiring_status || "(none)"} → ${hiringStatus}`, note?.toString().trim()]
        .filter(Boolean)
        .join(": "),
    },
    t1,
    t2,
  );
  return true;
}

const candidate = new RecruitmentDocumentService({
  module: "candidate",
  modelName: "RecruitmentCandidate",
  label: "Recruitment candidate",
  // Company, department, division, position and level are not taken from the body:
  // they are copied from the chosen recruitment request.
  // hiring_status is not taken from the body since 2026-11-24: a new candidate is
  // "contacting", then the interviews or PATCH /candidates/hiring-status/:id set it.
  fields: [
    "id_recruitment_request", "name", "phone_number", "email", "job_title", "source", "disc",
    "recruitment_process", "hr_interview_mechanism", "hr_interview_date", "hr_interview_time",
    "hr_interview_meeting_room", "hr_interview_meeting_room_link",
    "user_interview_mechanism", "user_interview_date", "user_interview_time",
    "has_professional_license", "license_type", "license_type_other",
    "birth_date", "birth_place", "address",
  ],
  fileableType: "recruitment_candidates",
  fileCategories: ["files_cv", "files_application_form"],
  // Saved straight away, with no approval; HR can always edit a candidate, e.g. to
  // reschedule an interview.
  withoutApproval: true,
  editableStatuses: null,
  // A candidate always has a CV.
  validateInput(input, existing) {
    const cv = input.files_cv;
    if (!existing && (!Array.isArray(cv) || !cv.length)) fail("files_cv must be a non-empty array");
    if (existing && cv !== undefined && (!Array.isArray(cv) || !cv.length))
      fail("files_cv cannot be emptied: a candidate needs a CV");
  },
  includes: () => [
    {
      model: models.db1.RecruitmentRequest,
      as: "recruitment_request",
      attributes: ["id", "request_no", "status", "hiring_status", "number_of_people", "hiring_deadline", "request_type"],
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
    for (const key of ["hr_interview_date", "user_interview_date", "birth_date"]) check.date(data, key);
    if (!existing) Object.assign(data, { hiring_status: "contacting", hiring_status_updated_at: new Date() });
    for (const key of ["hr_interview_time", "user_interview_time"]) check.time(data, key);
    checkLicense(data, existing);
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

// HR sets the hiring status by hand, to any value (H1), with an optional note.
candidate.setHiringStatus = async function setHiringStatus(id, hiringStatus, userId, note, isDoubleDatabase = true) {
  await withTransactions(isDoubleDatabase, async (t1, t2) => {
    const changed = await setCandidateHiringStatus(id, hiringStatus, userId, note, t1, t2);
    if (!changed) fail(`Hiring status is already ${hiringStatus}`, 409);
  });
  return this.getById(id);
};

// Candidate data shown on the interview forms (Bagian 1 Recruitment Request and
// Bagian 2 Candidate Information).
const candidateDetail = () => {
  const db = models.db1;
  return {
    model: db.RecruitmentCandidate,
    as: "candidate",
    attributes: [
      "id", "id_recruitment_request", "name", "phone_number", "email", "source", "job_title", "hiring_status",
      "birth_date", "birth_place", "address", "id_position", "id_department", "id_division", "id_company", "id_level",
    ],
    include: [
      { model: db.RecruitmentRequest, as: "recruitment_request", attributes: ["id", "request_no"] },
      { model: db.User, as: "user_request", attributes: ["id", "name"] },
      company(), department(), division(), position(), level(),
      ...["files_cv", "files_application_form"].map((as) => ({
        model: db.File, as, required: false, where: { is_active: true },
      })),
    ],
  };
};

// Schedule of an interview (H12): date, time and method; an offline one needs a
// room, an online one a link (the other is cleared). values: the fields after the
// save (sent over stored).
async function checkSchedule(data, existing, t1) {
  const value = (key) => (data[key] !== undefined ? data[key] : existing?.[key]);
  for (const key of ["interview_date", "interview_time", "method"])
    if (!existing || data[key] !== undefined) check.required({ [key]: value(key) }, key);
  check.date(data, "interview_date");
  check.time(data, "interview_time");
  if (data.method !== undefined) check.oneOf(data, "method", INTERVIEW_METHODS);
  const method = value("method");
  if (method === "offline") {
    if (!String(value("meeting_room") ?? "").trim()) fail("meeting_room is required for an offline interview");
    data.meeting_link = null;
  } else if (method === "online") {
    if (!String(value("meeting_link") ?? "").trim()) fail("meeting_link is required for an online interview");
    data.meeting_room = null;
  }
  if (data.id_user_interviewer !== undefined) {
    check.required(data, "id_user_interviewer");
    check.id(data, "id_user_interviewer");
    const user = await models.db1.User.findOne({
      where: { id: data.id_user_interviewer, is_active: true },
      attributes: ["id"],
      transaction: t1,
    });
    if (!user) fail("Interviewer not found", 404);
  }
}

// HR interview (bagian 3): HR schedules it, then fills the result with
// PATCH /hr-interviews/result/:id. While scheduled the schedule can be changed.
const hrInterview = new RecruitmentDocumentService({
  module: "hr interview",
  modelName: "RecruitmentHrInterview",
  label: "HR interview",
  // work_system and salary stay optional for the offering defaults (H15).
  fields: ["interview_date", "interview_time", "method", "meeting_room", "meeting_link", "id_user_interviewer",
    "work_system", "salary"],
  createOnly: ["id_recruitment_candidate"],
  fileableType: "recruitment_hr_interviews",
  fileCategories: ["files_attachment"],
  editableStatuses: ["scheduled"],
  initialStatus: () => "scheduled",
  includes: () => {
    const db = models.db1;
    return [
      candidateDetail(),
      { model: db.User, as: "interviewer", attributes: ["id", "name", "email"] },
      { model: db.User, as: "user_result", attributes: ["id", "name"] },
      {
        model: db.RecruitmentPsychotest,
        as: "psychotests",
        separate: true,
        where: { is_active: true },
        order: [["id", "ASC"]],
        include: [{ model: db.File, as: "files_result", required: false, where: { is_active: true } }],
      },
      { model: db.RecruitmentInterviewScore, as: "scores", separate: true, order: [["sort_order", "ASC"], ["id", "ASC"]] },
    ];
  },
  async prepare(data, existing, t1, userId) {
    if (!existing) {
      const { candidate: row } = await enterStage("hr interview", data.id_recruitment_candidate, t1);
      data.candidate_name = row.name;
      data.id_user_interviewer ??= userId;
    }
    await checkSchedule(data, existing, t1);
    return data;
  },
  // Scheduling it moves the candidate to "hr interview" (H3).
  async afterSave(doc, input, userId, t1, t2, existing) {
    if (existing) return;
    await setCandidateHiringStatus(
      doc.id_recruitment_candidate,
      "hr interview",
      userId,
      `HR interview scheduled on ${doc.interview_date} ${doc.interview_time}`,
      t1,
      t2,
    );
  },
});

/**
 * HR fills the result of a scheduled HR interview (bagian 3, POV): the attendance;
 * when the candidate came, the psychotests, the report scores, the description and
 * the recommendation. No show → candidate "hr interview no show"; recommended →
 * "user interview" (H4); not recommended → "hr interview rejected". Filled once.
 * @param {Object} body - { attendance, psychotests: [{ tool_name, description, files_result }], scores: [{ id_report_item, score }], description, recommendation }
 */
hrInterview.submitResult = async function submitResult(id, body, userId, isDoubleDatabase = true) {
  check.oneOf(body, "attendance", ATTENDANCES);
  const attended = body.attendance === "attended";
  if (attended) check.oneOf(body, "recommendation", HR_RECOMMENDATIONS);
  const psychotests = attended ? body.psychotests ?? [] : [];
  if (!Array.isArray(psychotests)) fail("psychotests must be an array");
  psychotests.forEach((row, index) => {
    if (!String(row?.tool_name ?? "").trim()) fail(`psychotests[${index}].tool_name is required`);
    if (row.files_result !== undefined && !Array.isArray(row.files_result))
      fail(`psychotests[${index}].files_result must be an array`);
  });
  await withTransactions(isDoubleDatabase, async (t1, t2) => {
    const doc = await this.lock(id, t1);
    if (doc.status !== "scheduled")
      fail(`The result can only be filled once, while the interview is scheduled, not ${doc.status}`, 409);
    const scores = attended ? await reportItemService.buildScores(body.scores, t1) : [];
    const description = String(body.description ?? "").trim() || null;
    await mirrorUpdate(
      "RecruitmentHrInterview",
      doc.id,
      {
        attendance: body.attendance,
        recommendation: attended ? body.recommendation : null,
        description,
        status: attended ? "completed" : "no show",
        id_user_result: userId,
        result_at: new Date(),
      },
      t1,
      t2,
    );
    for (const row of psychotests) {
      const psychotest = await mirrorCreate(
        "RecruitmentPsychotest",
        {
          id_recruitment_hr_interview: doc.id,
          tool_name: String(row.tool_name).trim(),
          description: String(row.description ?? "").trim() || null,
          is_active: true,
        },
        t1,
        t2,
      );
      await syncFiles("recruitment_psychotests", psychotest.id, "files_result", row.files_result, userId, t1, t2);
    }
    for (const score of scores)
      await mirrorCreate("RecruitmentInterviewScore", { ...score, interview_type: "hr", id_interview: doc.id }, t1, t2);
    const outcome = !attended ? "no show" : body.recommendation;
    await this.addProgress(doc.id, userId, outcome, description, t1, t2);
    await setCandidateHiringStatus(
      doc.id_recruitment_candidate,
      { "no show": "hr interview no show", recommended: "user interview", "not recommended": "hr interview rejected" }[outcome],
      userId,
      `HR interview ${outcome}`,
      t1,
      t2,
    );
  });
  return this.getById(id);
};

// User interview (bagian 4): HR schedules it with one or more interviewers, each
// with their own schedule; HR fills each attendance and each interviewer fills a
// report and a decision. The candidate's result follows H5; a considered candidate
// is kept CONSIDERATION_DAYS (H6) with a reminder REMINDER_DAYS before the end.
const CONSIDERATION_DAYS = 14;
const REMINDER_DAYS = 3;
const addDays = (date, days) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const INTERVIEWER_FIELDS = ["interview_date", "interview_time", "method", "meeting_room", "meeting_link"];
const isEnforced = () => process.env.APPROVAL_ENFORCE === "true";

// Interviewers from the body, checked: a user once, each with a full schedule
// (H12); the position is the user's (H10).
async function prepareInterviewers(list, t1) {
  if (!Array.isArray(list) || !list.length) fail("interviewers must be a non-empty array");
  const seen = new Set();
  const rows = [];
  for (const [index, raw] of list.entries()) {
    const label = `interviewers[${index}]`;
    const row = Object.fromEntries(
      ["id", "id_user", ...INTERVIEWER_FIELDS].filter((key) => raw?.[key] !== undefined).map((key) => [key, raw[key] === "" ? null : raw[key]]),
    );
    try {
      check.required(row, "id_user");
      check.id(row, "id_user");
      await checkSchedule(row, null, t1);
    } catch (error) {
      error.message = `${label}: ${error.message}`;
      throw error;
    }
    if (seen.has(Number(row.id_user))) fail(`${label}: the same user is listed twice`);
    seen.add(Number(row.id_user));
    const user = await models.db1.User.findOne({
      where: { id: row.id_user, is_active: true },
      attributes: ["id"],
      include: [{ model: models.db1.Position, as: "position", attributes: ["position_name"] }],
      transaction: t1,
    });
    if (!user) fail(`${label}: user not found`, 404);
    rows.push({ ...row, id_user: Number(row.id_user), position_name: user.position?.position_name ?? null });
  }
  return rows;
}

// Interviewers checked in prepare, waiting for the user interview id in afterSave;
// keyed by the request's transaction.
const pendingInterviewers = new WeakMap();

// Replaces the interviewers of a scheduled user interview with the checked rows:
// rows with an id are updated, new ones are added, missing ones removed; an
// interviewer whose attendance is recorded can no longer change or be removed.
async function syncInterviewers(idUserInterview, rows, t1, t2) {
  const existing = await models.db1.RecruitmentUserInterviewer.findAll({
    where: { id_recruitment_user_interview: idUserInterview, is_active: true },
    transaction: t1,
  });
  const kept = new Set();
  for (const [index, row] of rows.entries()) {
    const { id, ...data } = row;
    if (id === undefined || id === null) {
      await mirrorCreate(
        "RecruitmentUserInterviewer",
        { ...data, id_recruitment_user_interview: idUserInterview, is_active: true },
        t1,
        t2,
      );
      continue;
    }
    const current = existing.find((item) => item.id === Number(id));
    if (!current) fail(`interviewers[${index}].id is not an interviewer of this user interview`);
    kept.add(current.id);
    if (current.attendance) {
      const changed = Object.keys(data).some((key) => String(current[key] ?? "") !== String(data[key] ?? ""));
      if (changed) fail(`interviewers[${index}] already has an attendance and cannot be changed`, 409);
      continue;
    }
    await mirrorUpdate("RecruitmentUserInterviewer", current.id, data, t1, t2);
  }
  for (const current of existing) {
    if (kept.has(current.id)) continue;
    if (current.attendance) fail(`Interviewer ${current.id} already has an attendance and cannot be removed`, 409);
    await mirrorUpdate("RecruitmentUserInterviewer", current.id, { is_active: false }, t1, t2);
  }
}

// Reminder flags of a considered result (H6).
function considerationFlags(doc, today = new Date().toISOString().slice(0, 10)) {
  const due = doc.consideration_due_date;
  const waiting = doc.status === "completed" && doc.result === "considered" && Boolean(due);
  return {
    needs_decision_reminder: waiting && today >= addDays(due, -REMINDER_DAYS),
    is_consideration_overdue: waiting && today > due,
  };
}

const interviewersInclude = () => {
  const db = models.db1;
  return {
    model: db.RecruitmentUserInterviewer,
    as: "interviewers",
    separate: true,
    where: { is_active: true },
    order: [["interview_date", "ASC"], ["interview_time", "ASC"], ["id", "ASC"]],
    include: [
      { model: db.User, as: "user", attributes: ["id", "name", "email"] },
      { model: db.User, as: "user_attendance", attributes: ["id", "name"] },
      { model: db.RecruitmentInterviewScore, as: "scores", separate: true, order: [["sort_order", "ASC"], ["id", "ASC"]] },
    ],
  };
};

// Latest HR interview that recommended the candidate: Bagian 2 of the user
// interview (psychotests and HR report).
async function recommendingHrInterview(idCandidate) {
  const db = models.db1;
  const row = await db.RecruitmentHrInterview.findOne({
    where: { id_recruitment_candidate: idCandidate, is_active: true, status: "completed", recommendation: "recommended" },
    order: [["id", "DESC"]],
    include: [
      { model: db.User, as: "interviewer", attributes: ["id", "name"] },
      {
        model: db.RecruitmentPsychotest,
        as: "psychotests",
        separate: true,
        where: { is_active: true },
        order: [["id", "ASC"]],
        include: [{ model: db.File, as: "files_result", required: false, where: { is_active: true } }],
      },
      { model: db.RecruitmentInterviewScore, as: "scores", separate: true, order: [["sort_order", "ASC"], ["id", "ASC"]] },
    ],
  });
  return row ? row.toJSON() : null;
}

const userInterview = new RecruitmentDocumentService({
  module: "user interview",
  modelName: "RecruitmentUserInterview",
  label: "User interview",
  // The interviewers come in the body as `interviewers`; the recommended salary,
  // benefit and start date stay optional for the offering defaults (H15).
  fields: ["interviewers", "recommended_salary", "recommended_benefit", "active_work_date"],
  createOnly: ["id_recruitment_candidate"],
  editableStatuses: ["scheduled"],
  initialStatus: () => "scheduled",
  includes: () => [candidateDetail(), interviewersInclude()],
  validateInput(input, existing) {
    if (!existing && (!Array.isArray(input.interviewers) || !input.interviewers.length))
      fail("interviewers must be a non-empty array");
  },
  async prepare(data, existing, t1) {
    if (!existing) {
      const { candidate: row } = await enterStage("user interview", data.id_recruitment_candidate, t1);
      data.candidate_name = row.name;
    }
    check.amount(data, "recommended_salary");
    check.date(data, "active_work_date");
    // Checked before anything is saved; stored by afterSave once the id is known.
    if (data.interviewers !== undefined) {
      pendingInterviewers.set(t1, await prepareInterviewers(data.interviewers, t1));
      delete data.interviewers;
    }
    return data;
  },
  async afterSave(doc, input, userId, t1, t2, existing) {
    const rows = pendingInterviewers.get(t1);
    if (rows) {
      pendingInterviewers.delete(t1);
      await syncInterviewers(doc.id, rows, t1, t2);
    }
    // A new user interview (also after a no show, H16) puts the candidate at "user interview".
    if (!existing)
      await setCandidateHiringStatus(doc.id_recruitment_candidate, "user interview", userId, "User interview scheduled", t1, t2);
  },
  async decorate(row, isDetail) {
    const data = { ...row, ...considerationFlags(row) };
    if (isDetail) data.hr_interview = await recommendingHrInterview(row.id_recruitment_candidate);
    return data;
  },
});

// Locks an active interviewer of a user interview.
async function lockInterviewer(idUserInterview, idInterviewer, t1) {
  const row = await models.db1.RecruitmentUserInterviewer.findOne({
    where: { id: idInterviewer, id_recruitment_user_interview: idUserInterview, is_active: true },
    transaction: t1,
    lock: t1.LOCK.UPDATE,
  });
  if (!row) fail("Interviewer not found", 404);
  return row;
}

// The candidate's result once every interviewer is settled (H5): a no show is
// handled by setAttendance; otherwise every interviewer needs an attendance and a
// decision. Any not accepted → not accepted; else any considered → considered;
// else accepted. A considered result keeps its 14 days while it stays considered.
userInterview.settle = async function settle(doc, userId, t1, t2) {
  const rows = await models.db1.RecruitmentUserInterviewer.findAll({
    where: { id_recruitment_user_interview: doc.id, is_active: true },
    transaction: t1,
  });
  if (rows.some((row) => row.attendance !== "attended" || !row.decision)) return;
  const decisions = rows.map((row) => row.decision);
  const result = decisions.includes("not accepted") ? "not accepted" : decisions.includes("considered") ? "considered" : "accepted";
  if (doc.status === "completed" && doc.result === result) return;
  const today = new Date().toISOString().slice(0, 10);
  const due = result !== "considered"
    ? null
    : doc.result === "considered" && doc.consideration_due_date ? doc.consideration_due_date : addDays(today, CONSIDERATION_DAYS);
  await mirrorUpdate(
    "RecruitmentUserInterview",
    doc.id,
    { status: "completed", result, consideration_due_date: due, result_at: new Date() },
    t1,
    t2,
  );
  await this.addProgress(doc.id, userId, `result ${result}`, due ? `Considered until ${due}` : null, t1, t2);
  await setCandidateHiringStatus(
    doc.id_recruitment_candidate,
    { accepted: "offering letter", considered: "user interview consideration", "not accepted": "user interview rejected" }[result],
    userId,
    `User interview ${result}`,
    t1,
    t2,
  );
};

/** HR records whether the candidate came to one interviewer's interview (bagian 1 POV). */
userInterview.setAttendance = async function setAttendance(id, idInterviewer, attendance, userId, isDoubleDatabase = true) {
  check.oneOf({ attendance }, "attendance", ATTENDANCES);
  await withTransactions(isDoubleDatabase, async (t1, t2) => {
    const doc = await this.lock(id, t1);
    if (doc.status !== "scheduled") fail(`Attendance can only be recorded while the user interview is scheduled, not ${doc.status}`, 409);
    const row = await lockInterviewer(doc.id, idInterviewer, t1);
    if (row.attendance) fail(`Attendance is already ${row.attendance}`, 409);
    await mirrorUpdate(
      "RecruitmentUserInterviewer",
      row.id,
      { attendance, id_user_attendance: userId, attendance_at: new Date() },
      t1,
      t2,
    );
    await this.addProgress(doc.id, userId, `attendance ${attendance}`, `Interviewer user ${row.id_user}`, t1, t2);
    if (attendance === "no show") {
      // A no show ends the user interview at once (H5); HR may schedule another (H16).
      await mirrorUpdate("RecruitmentUserInterview", doc.id, { status: "no show", result_at: new Date() }, t1, t2);
      await setCandidateHiringStatus(doc.id_recruitment_candidate, "user interview no show", userId, "User interview no show", t1, t2);
      return;
    }
    await this.settle(doc, userId, t1, t2);
  });
  return this.getById(id);
};

/**
 * The interviewer fills the report and the decision (accepted / considered / not
 * accepted) once HR recorded them as attended. While the candidate's result is
 * considered, an interviewer who considered may change to accepted or not
 * accepted (H6); the report stays as first filled.
 * @param {Object} body - { decision, scores: [{ id_report_item, score }], description }
 */
userInterview.submitDecision = async function submitDecision(id, idInterviewer, body, userId, isDoubleDatabase = true) {
  check.oneOf(body, "decision", USER_DECISIONS);
  await withTransactions(isDoubleDatabase, async (t1, t2) => {
    const doc = await this.lock(id, t1);
    const row = await lockInterviewer(doc.id, idInterviewer, t1);
    if (Number(row.id_user) !== Number(userId)) {
      const message = "Only the interviewer can fill their user interview report";
      if (isEnforced()) fail(message, 403);
      console.warn(`[recruitment] user interview #${doc.id} interviewer #${row.id} by user ${userId}: ${message} (not enforced)`);
    }
    if (row.attendance !== "attended") fail("HR must record the candidate as attended first", 409);
    const description = body.description === undefined ? undefined : String(body.description ?? "").trim() || null;
    if (!row.decision) {
      if (doc.status !== "scheduled") fail(`The user interview is ${doc.status}`, 409);
      const scores = await reportItemService.buildScores(body.scores, t1);
      for (const score of scores)
        await mirrorCreate("RecruitmentInterviewScore", { ...score, interview_type: "user", id_interview: row.id }, t1, t2);
    } else {
      const reconsidering = row.decision === "considered" && doc.status === "completed" && doc.result === "considered";
      if (!reconsidering) fail("The decision can only change while the candidate is considered", 409);
      if (body.decision === "considered") fail("The decision is already considered", 409);
    }
    await mirrorUpdate(
      "RecruitmentUserInterviewer",
      row.id,
      { decision: body.decision, decided_at: new Date(), ...(description !== undefined && { description }) },
      t1,
      t2,
    );
    await this.addProgress(doc.id, userId, `decision ${body.decision}`, description ?? null, t1, t2);
    await this.settle(doc, userId, t1, t2);
  });
  return this.getById(id);
};

/**
 * "Interview saya" (H11): the user interviews the user is an interviewer of, with
 * what each waits for. pending: only those that wait for something.
 */
userInterview.mine = async function mine(userId, { pending = false } = {}) {
  const db = models.db1;
  const rows = await db.RecruitmentUserInterviewer.findAll({
    where: { id_user: userId, is_active: true },
    include: [
      {
        model: db.RecruitmentUserInterview,
        as: "user_interview",
        required: true,
        where: { is_active: true },
        attributes: ["id", "id_recruitment_candidate", "candidate_name", "status", "result", "consideration_due_date"],
        include: [
          {
            model: db.RecruitmentCandidate,
            as: "candidate",
            attributes: ["id", "name", "hiring_status", "id_user_request"],
            include: [position(), department(), candidateCreator()],
          },
        ],
      },
    ],
    order: [["interview_date", "DESC"], ["interview_time", "DESC"], ["id", "DESC"]],
  });
  return rows
    .map((item) => {
      const row = item.toJSON();
      const doc = row.user_interview;
      const needsDecision = row.decision === "considered" && doc.status === "completed" && doc.result === "considered";
      return {
        ...row,
        waits_for_attendance: doc.status === "scheduled" && !row.attendance,
        needs_report: doc.status === "scheduled" && row.attendance === "attended" && !row.decision,
        needs_final_decision: needsDecision,
        ...considerationFlags(doc),
      };
    })
    .filter((row) => !pending || row.needs_report || row.needs_final_decision || row.waits_for_attendance);
};

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

// Active candidates that may enter `stage` now, for the candidate dropdown of
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
    candidateCreator(),
  ];
  if (rule.previous) {
    const previous = STAGES[rule.previous.stage];
    include.push({
      model: db[previous.modelName],
      as: previous.as,
      required: true,
      where: { is_active: true, ...rule.previous.where },
    });
  }
  const rows = await db.RecruitmentCandidate.findAll({
    where: { is_active: true },
    include,
    order: [["name", "ASC"]],
  });
  return rows
    .map((row) => row.toJSON())
    .filter((row) => !row[rule.as].some((doc) => activeOf(rule).includes(doc.status)))
    .map(({ [rule.as]: current, ...row }) => {
      if (!rule.previous) return row;
      const previousAs = STAGES[rule.previous.stage].as;
      const { [previousAs]: previous, ...rest } = row;
      return { ...rest, previous_step: [...previous].sort((a, b) => b.id - a.id)[0] };
    });
}

module.exports = {
  ...services,
  services,
  candidateOptions,
  STAGES,
  enterStage,
  isHrDivision,
  setCandidateHiringStatus,
  CANDIDATE_HIRING_STATUSES,
};
