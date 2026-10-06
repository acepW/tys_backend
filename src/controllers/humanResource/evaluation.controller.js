const evaluationService = require("../../services/humanResource/evaluation.service");
const { successResponse, errorResponse } = require("../../utils/response");
const { isValidDateOnly } = require("../../utils/employeeContract");

const countFields = [
  "working_days",
  "present_days",
  "sick_days",
  "absent_days",
  "permission_days",
  "leave_days",
  "late_minutes",
];

const evaluationTypes = ["probation", "annual"];

const isPositiveInteger = (value) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0;

const isCount = (value) =>
  value !== "" && Number.isSafeInteger(Number(value)) && Number(value) >= 0;

class EvaluationController {
  async getAll(req, res) {
    try {
      const where = {};
      if (req.query.type !== undefined) {
        if (!evaluationTypes.includes(req.query.type)) {
          return errorResponse(res, "type must be probation or annual", 400);
        }
        where.type = req.query.type;
      }
      for (const field of ["id_employee", "id_position", "id_department"]) {
        if (req.query[field] === undefined) continue;
        if (!isPositiveInteger(req.query[field])) {
          return errorResponse(res, `${field} must be a positive integer`, 400);
        }
        where[field] = Number(req.query[field]);
      }
      const result = await evaluationService.getAll(
        where,
        Number(req.query.page) || null,
        Number(req.query.limit) || null,
      );
      return successResponse(res, result, "Evaluations retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 500);
    }
  }

  async getById(req, res) {
    try {
      const result = await evaluationService.getById(req.params.id);
      if (!result) return errorResponse(res, "Evaluation not found", 404);
      return successResponse(res, result, "Evaluation retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 500);
    }
  }

  async create(req, res) {
    try {
      const body = req.body || {};
      if (!evaluationTypes.includes(body.type)) {
        return errorResponse(res, "type must be probation or annual", 400);
      }
      if (!isPositiveInteger(body.id_employee)) {
        return errorResponse(res, "id_employee must be a positive integer", 400);
      }
      for (const field of ["id_position", "id_department"]) {
        if (body[field] != null && !isPositiveInteger(body[field])) {
          return errorResponse(res, `${field} must be a positive integer`, 400);
        }
      }
      if (body.hire_date != null && !isValidDateOnly(body.hire_date)) {
        return errorResponse(res, "hire_date must use YYYY-MM-DD format", 400);
      }
      if (
        body.attendance_assessment != null &&
        (body.attendance_assessment === "" ||
          !Number.isFinite(Number(body.attendance_assessment)) ||
          Number(body.attendance_assessment) < 0 ||
          Number(body.attendance_assessment) > 999.99)
      ) {
        return errorResponse(
          res,
          "attendance_assessment must be a number between 0 and 999.99",
          400,
        );
      }
      const data = {
        type: body.type,
        id_employee: Number(body.id_employee),
        id_position: body.id_position != null ? Number(body.id_position) : undefined,
        id_department: body.id_department != null ? Number(body.id_department) : undefined,
        hire_date: body.hire_date ?? undefined,
        attendance_assessment:
          body.attendance_assessment != null
            ? Number(body.attendance_assessment)
            : null,
        id_user_create: req.user.id,
      };
      for (const field of countFields) {
        if (body[field] == null) {
          data[field] = 0;
          continue;
        }
        if (!isCount(body[field])) {
          return errorResponse(res, `${field} must be a non-negative integer`, 400);
        }
        data[field] = Number(body[field]);
      }

      const result = await evaluationService.createEvaluation(
        data,
        body.is_double_database !== false,
      );
      return successResponse(res, result, "Evaluation created successfully", 201);
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 500);
    }
  }
}

module.exports = new EvaluationController();
