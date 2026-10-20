const { Op } = require("sequelize");
const recruitment = require("../../services/humanResource/recruitment/recruitment.service");
const approvalAccess = require("../../services/approvalFlow/approvalAccess.service");
const { successResponse, errorResponse } = require("../../utils/response");

function respondError(res, error) {
  return errorResponse(res, error.message, error.statusCode || 500);
}

const like = (value) => ({ [Op.like]: `%${value}%` });
const stepFilters = { equal: ["id_recruitment_candidate", "status", "decision"], like: { search: "candidate_name" } };

// Per module: service, approval_for, list filters (equal: exact match query keys;
// like: query key -> column searched with LIKE) and response labels.
const MODULES = {
  requests: {
    service: recruitment.request, approvalFor: "recruitment request", label: "Recruitment request",
    filters: { equal: ["id_position", "status"], like: { search: "job_title" } },
  },
  candidates: {
    service: recruitment.candidate, approvalFor: "recruitment candidate", label: "Recruitment candidate",
    filters: { equal: ["id_position", "id_department", "status"], like: { name: "name", job_title: "job_title" } },
  },
  "hr-interviews": {
    service: recruitment.hrInterview, approvalFor: "recruitment hr interview", label: "HR interview",
    filters: stepFilters,
  },
  "user-interviews": {
    service: recruitment.userInterview, approvalFor: "recruitment user interview", label: "User interview",
    filters: stepFilters,
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
  const flags = (data, req) => approvalAccess.attachActionFlags(approvalFor, data, req.user?.id);
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
            await service.decide(req.params.id, decision, req.user.id, body.note, isDouble(body)),
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

module.exports = {
  MODULES,
  modules: Object.fromEntries(Object.entries(MODULES).map(([path, config]) => [path, moduleController(config)])),
  candidateOptions,
};
