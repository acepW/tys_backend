const { models, fail, mirrorUpdate } = require("../../procurement/shared");
const { RecruitmentDocumentService, check } = require("./recruitmentDocument.service");

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
const candidateInclude = () => ({
  model: models.db1.RecruitmentCandidate,
  as: "candidate",
  attributes: ["id", "name", "job_title", "id_position", "id_department", "status"],
});

const request = new RecruitmentDocumentService({
  module: "request",
  modelName: "RecruitmentRequest",
  label: "Recruitment request",
  fields: ["job_title", "id_position", "job_recruitment", "job_description"],
  includes: () => [position()],
  async prepare(data, existing) {
    if (!existing || data.job_title !== undefined) check.required(data, "job_title");
    if (!existing || data.id_position !== undefined) check.required(data, "id_position");
    check.id(data, "id_position");
    return data;
  },
});

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

const candidate = new RecruitmentDocumentService({
  module: "candidate",
  modelName: "RecruitmentCandidate",
  label: "Recruitment candidate",
  fields: [
    "name", "job_title", "id_position", "id_department", "source", "disc", "recruitment_process",
    "hr_interview_mechanism", "hr_interview_date", "hr_interview_time",
    "user_interview_mechanism", "user_interview_date", "user_interview_time",
  ],
  fileableType: "recruitment_candidates",
  fileCategories: ["files_cv", "files_application_form"],
  // HR can always edit a candidate, e.g. to reschedule an interview.
  editableStatuses: null,
  includes: () => [position(), department(), ...stepIncludes()],
  async prepare(data, existing) {
    if (!existing || data.name !== undefined) check.required(data, "name");
    for (const key of ["id_position", "id_department"]) check.id(data, key);
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

module.exports = { ...services, services, candidateOptions, STAGES, enterStage };
