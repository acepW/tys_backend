const { Op } = require("sequelize");
const recruitment = require("../../services/humanResource/recruitment/recruitment.service");
const approvalAccess = require("../../services/approvalFlow/approvalAccess.service");
const reportItemService = require("../../services/humanResource/recruitment/reportItem.service");
const { successResponse, errorResponse } = require("../../utils/response");

function respondError(res, error) {
  return errorResponse(res, error.message, error.statusCode || 500);
}

const like = (value) => ({ [Op.like]: `%${value}%` });

// Per module: service, approval_for (none for the candidate database, which has no
// approval), list filters (equal: exact match query keys; like: query key -> column
// searched with LIKE) and response labels.
const MODULES = {
  requests: {
    service: recruitment.request, approvalFor: "recruitment request", label: "Recruitment request",
    filters: {
      equal: ["id_company", "id_department", "id_division", "id_position", "id_level", "request_type",
        "hiring_status", "status"],
      like: { search: "job_description" },
    },
  },
  candidates: {
    service: recruitment.candidate, approvalFor: null, label: "Recruitment candidate",
    filters: {
      equal: ["id_recruitment_request", "id_company", "id_department", "id_division", "id_position", "id_level",
        "has_professional_license", "license_type", "hiring_status"],
      like: { name: "name", job_title: "job_title" },
    },
  },
  // No approval since 2026-11-24: scheduled, then the result (PATCH /hr-interviews/result/:id).
  "hr-interviews": {
    service: recruitment.hrInterview, approvalFor: null, label: "HR interview",
    filters: {
      equal: ["id_recruitment_candidate", "status", "attendance", "recommendation", "id_user_interviewer"],
      like: { search: "candidate_name" },
    },
  },
  // No approval since 2026-11-24: scheduled with interviewers, then attendance and decisions.
  "user-interviews": {
    service: recruitment.userInterview, approvalFor: null, label: "User interview",
    filters: { equal: ["id_recruitment_candidate", "status", "result"], like: { search: "candidate_name" } },
  },
  offerings: {
    service: recruitment.offering, approvalFor: "recruitment offering", label: "Offering letter",
    filters: { equal: ["id_recruitment_candidate", "status"], like: { search: "candidate_name" } },
  },
  contracts: {
    service: recruitment.contract, approvalFor: "recruitment contract", label: "Employment contract",
    filters: { equal: ["id_recruitment_candidate", "status"], like: { search: "candidate_name" } },
  },
};

// Builds the handlers of one module.
function moduleController({ service, approvalFor, label, filters }) {
  const flags = (data, req) =>
    approvalFor ? approvalAccess.attachActionFlags(approvalFor, data, req.user?.id) : data;
  const isDouble = (body) => body.is_double_database !== false;
  return {
    async getAll(req, res) {
      try {
        const query = req.query || {};
        const where = {};
        for (const key of filters.equal) if (query[key]) where[key] = query[key];
        for (const [key, column] of Object.entries(filters.like)) if (query[key]) where[column] = like(query[key]);
        const result = await service.getAll(where, Number(query.page) || null, Number(query.limit) || null);
        return successResponse(res, await flags(result, req));
      } catch (error) { return respondError(res, error); }
    },
    async getById(req, res) {
      try {
        const result = await service.getById(req.params.id);
        if (!result) return errorResponse(res, `${label} not found`, 404);
        return successResponse(res, await flags(result, req));
      } catch (error) { return respondError(res, error); }
    },
    async create(req, res) {
      try {
        const body = req.body || {};
        return successResponse(res, await service.create(body, req.user.id, isDouble(body)), `${label} created`, 201);
      } catch (error) { return respondError(res, error); }
    },
    async update(req, res) {
      try {
        const body = req.body || {};
        return successResponse(res, await service.update(req.params.id, body, req.user.id, isDouble(body)),
          `${label} updated`);
      } catch (error) { return respondError(res, error); }
    },
    decide(decision) {
      return async (req, res) => {
        try {
          const body = req.body || {};
          return successResponse(res,
            await service.decide(req.params.id, decision, req.user.id, body.note, isDouble(body), body.reject_to),
            `${label} ${decision === "approve" ? "approved" : "rejected"}`);
        } catch (error) { return respondError(res, error); }
      };
    },
  };
}

async function candidateOptions(req, res) {
  try {
    return successResponse(res, await recruitment.candidateOptions(req.query?.stage));
  } catch (error) { return respondError(res, error); }
}

// Opens or closes hiring on an approved recruitment request.
async function setRequestHiringStatus(req, res) {
  try {
    const body = req.body || {};
    const result = await recruitment.request.setHiringStatus(req.params.id, body.hiring_status, req.user.id, body.note,
      body.is_double_database !== false);
    return successResponse(res, await approvalAccess.attachActionFlags("recruitment request", result, req.user?.id),
      `Hiring ${body.hiring_status === "close" ? "closed" : "opened"}`);
  } catch (error) { return respondError(res, error); }
}

// HR fills the result of a scheduled HR interview.
async function submitHrInterviewResult(req, res) {
  try {
    const body = req.body || {};
    return successResponse(res,
      await recruitment.hrInterview.submitResult(req.params.id, body, req.user.id, body.is_double_database !== false),
      "HR interview result saved");
  } catch (error) { return respondError(res, error); }
}

// User interview: HR records an interviewer's attendance; the interviewer decides.
async function setUserInterviewAttendance(req, res) {
  try {
    const body = req.body || {};
    return successResponse(res, await recruitment.userInterview.setAttendance(req.params.id, req.params.interviewerId,
      body.attendance, req.user.id, body.is_double_database !== false), "Attendance saved");
  } catch (error) { return respondError(res, error); }
}
async function submitUserInterviewDecision(req, res) {
  try {
    const body = req.body || {};
    return successResponse(res, await recruitment.userInterview.submitDecision(req.params.id, req.params.interviewerId,
      body, req.user.id, body.is_double_database !== false), "User interview decision saved");
  } catch (error) { return respondError(res, error); }
}
// The user interviews of the user logged in (interview saya).
async function myUserInterviews(req, res) {
  try {
    return successResponse(res, await recruitment.userInterview.mine(req.user.id,
      { pending: String(req.query?.pending) === "true" }));
  } catch (error) { return respondError(res, error); }
}

// HR sets a candidate's hiring status by hand (any of the 15 values).
async function setCandidateHiringStatus(req, res) {
  try {
    const body = req.body || {};
    const result = await recruitment.candidate.setHiringStatus(req.params.id, body.hiring_status, req.user.id,
      body.note, body.is_double_database !== false);
    return successResponse(res, result, "Candidate hiring status updated");
  } catch (error) { return respondError(res, error); }
}

// Master of the interview report form (Laporan Interview), shared by the HR and
// user interviews.
const isDoubleBody = (req) => req.body?.is_double_database !== false;
const reportItems = {
  async list(req, res) {
    try {
      const includeInactive = String(req.query?.include_inactive) === "true";
      return successResponse(res, await reportItemService.list({ includeInactive }));
    } catch (error) { return respondError(res, error); }
  },
  async form(req, res) {
    try {
      return successResponse(res, await reportItemService.form());
    } catch (error) { return respondError(res, error); }
  },
  async create(req, res) {
    try {
      return successResponse(res, await reportItemService.create(req.body || {}, isDoubleBody(req)), "Report item created", 201);
    } catch (error) { return respondError(res, error); }
  },
  async update(req, res) {
    try {
      return successResponse(res, await reportItemService.update(req.params.id, req.body || {}, isDoubleBody(req)),
        "Report item updated");
    } catch (error) { return respondError(res, error); }
  },
  async remove(req, res) {
    try {
      return successResponse(res, await reportItemService.deactivate(req.params.id, req.query?.is_double_database !== "false"),
        "Report item deactivated");
    } catch (error) { return respondError(res, error); }
  },
};

// The requester submits a recruitment request returned to them again.
async function resubmitRequest(req, res) {
  try {
    const body = req.body || {};
    const result = await recruitment.request.resubmit(req.params.id, req.user.id, body.note,
      body.is_double_database !== false);
    return successResponse(res, await approvalAccess.attachActionFlags("recruitment request", result, req.user?.id),
      "Recruitment request resubmitted");
  } catch (error) { return respondError(res, error); }
}

module.exports = {
  MODULES,
  resubmitRequest,
  modules: Object.fromEntries(Object.entries(MODULES).map(([path, config]) => [path, moduleController(config)])),
  candidateOptions,
  setRequestHiringStatus,
  setCandidateHiringStatus,
  submitHrInterviewResult,
  setUserInterviewAttendance,
  submitUserInterviewDecision,
  myUserInterviews,
  reportItems,
};
