const { Op } = require("sequelize");
const service = require("../../services/humanResource/leaveRequest.service");
const { successResponse, errorResponse } = require("../../utils/response");
const { isValidDateOnly } = require("../../utils/holidayCalendar");

const OPTIONAL_TEXT = {
  health_facility_name: 255,
  clinic_phone: 50,
  clinic_address: null,
  doctor_name: 255,
};

function respondError(res, error) {
  return errorResponse(res, error.message, error.statusCode || 500);
}

// partial: only validate the fields that were sent (edit).
function validate(body, partial = false) {
  const has = (key) => !partial || body[key] !== undefined;
  if (has("id_employee")) {
    const id = Number(body.id_employee);
    if (!Number.isInteger(id) || id <= 0) return "id_employee must be a positive integer";
  }
  if (has("type")) {
    const type = String(body.type ?? "").trim();
    if (!type) return "type is required";
    if (type.length > 100) return "type must not exceed 100 characters";
  }
  for (const field of ["start_date", "end_date"])
    if (has(field) && !isValidDateOnly(body[field])) return `${field} must use YYYY-MM-DD format`;
  if (body.start_date && body.end_date && body.end_date < body.start_date)
    return "end_date must not be before start_date";
  if (body.duration !== undefined && body.duration !== null) {
    const duration = Number(body.duration);
    if (body.duration === "" || !Number.isFinite(duration) || duration <= 0)
      return "duration must be a positive number";
  }
  if (has("reason") && !String(body.reason ?? "").trim()) return "reason is required";
  for (const [field, max] of Object.entries(OPTIONAL_TEXT)) {
    const value = body[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") return `${field} must be a string`;
    if (max && value.length > max) return `${field} must not exceed ${max} characters`;
  }
  if (body.files_attachment !== undefined && !Array.isArray(body.files_attachment))
    return "files_attachment must be an array";
  return null;
}

class LeaveRequestController {
  async getAll(req, res) {
    try {
      const query = req.query || {};
      const where = {};
      for (const key of ["id_employee", "id_department", "status", "type"])
        if (query[key]) where[key] = query[key];
      if (query.search) where.reason = { [Op.like]: `%${query.search}%` };
      return successResponse(res, await service.getAll(where, Number(query.page) || null, Number(query.limit) || null),
        "Leave requests retrieved successfully");
    } catch (error) { return respondError(res, error); }
  }

  async getById(req, res) {
    try {
      const result = await service.getById(req.params.id);
      return result
        ? successResponse(res, result, "Leave request retrieved successfully")
        : errorResponse(res, "Leave request not found", 404);
    } catch (error) { return respondError(res, error); }
  }

  async create(req, res) {
    try {
      const body = req.body || {};
      const invalid = validate(body);
      if (invalid) return errorResponse(res, invalid, 400);
      return successResponse(res, await service.create(body, req.user.id, body.is_double_database !== false),
        "Leave request created successfully", 201);
    } catch (error) { return respondError(res, error); }
  }

  async update(req, res) {
    try {
      const body = req.body || {};
      const invalid = validate(body, true);
      if (invalid) return errorResponse(res, invalid, 400);
      return successResponse(res, await service.update(req.params.id, body, req.user.id, body.is_double_database !== false),
        "Leave request updated successfully");
    } catch (error) { return respondError(res, error); }
  }

  /** Route factory: approve/reject at one stage of the chain. */
  decide(stage, decision) {
    return async (req, res) => {
      try {
        const body = req.body || {};
        return successResponse(res,
          await service.decide(req.params.id, stage, decision, req.user.id, body.note, body.is_double_database !== false),
          `Leave request ${decision === "approve" ? "approved" : "rejected"} successfully`);
      } catch (error) { return respondError(res, error); }
    };
  }
}

module.exports = new LeaveRequestController();
