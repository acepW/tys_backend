const workScheduleService = require(
  "../../services/humanResource/workSchedule.service",
);
const { successResponse, errorResponse } = require("../../utils/response");
const { isValidDateOnly } = require("../../utils/employeeContract");
const {
  normalizeTime,
  isSameDayWorkPeriod,
} = require("../../utils/workSchedule");

const todayInJakarta = () =>
  new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

class WorkScheduleController {
  async getAll(req, res) {
    try {
      const filters = {};
      if (req.query.is_active !== undefined) {
        filters.is_active = req.query.is_active !== "false";
      }
      const schedules = await workScheduleService.getAll(filters);
      return successResponse(
        res,
        schedules,
        "Work schedules retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async getCurrent(req, res) {
    try {
      const date = req.query.date || todayInJakarta();
      if (!isValidDateOnly(date)) {
        return errorResponse(res, "date must use YYYY-MM-DD format", 400);
      }
      const schedule = await workScheduleService.getCurrent(date);
      if (!schedule) {
        return errorResponse(res, "No work schedule applies to this date", 404);
      }
      return successResponse(
        res,
        schedule,
        "Current work schedule retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async getById(req, res) {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return errorResponse(res, "id must be a positive integer", 400);
      }
      const schedule = await workScheduleService.findById(id);
      if (!schedule) return errorResponse(res, "Work schedule not found", 404);
      return successResponse(
        res,
        schedule,
        "Work schedule retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async create(req, res) {
    try {
      const scheduleCode = String(req.body?.schedule_code || "DEFAULT")
        .trim()
        .toUpperCase();
      const scheduleName = String(req.body?.schedule_name || "").trim();
      const checkInTime = normalizeTime(req.body?.check_in_time);
      const checkOutTime = normalizeTime(req.body?.check_out_time);
      const effectiveStartDate = req.body?.effective_start_date;

      if (!scheduleCode) {
        return errorResponse(res, "schedule_code is required", 400);
      }
      if (!scheduleName) {
        return errorResponse(res, "schedule_name is required", 400);
      }
      if (!checkInTime || !checkOutTime) {
        return errorResponse(
          res,
          "check_in_time and check_out_time must use HH:mm or HH:mm:ss format",
          400,
        );
      }
      if (!isSameDayWorkPeriod(checkInTime, checkOutTime)) {
        return errorResponse(
          res,
          "check_out_time must be later than check_in_time",
          400,
        );
      }
      if (!effectiveStartDate || !isValidDateOnly(effectiveStartDate)) {
        return errorResponse(
          res,
          "effective_start_date must use YYYY-MM-DD format",
          400,
        );
      }

      const schedule = await workScheduleService.createVersion(
        {
          schedule_code: scheduleCode,
          schedule_name: scheduleName,
          check_in_time: checkInTime,
          check_out_time: checkOutTime,
          effective_start_date: effectiveStartDate,
        },
        req.body?.is_double_database !== false,
      );
      return successResponse(
        res,
        schedule,
        "Work schedule version created successfully",
        201,
      );
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 500);
    }
  }
}

module.exports = new WorkScheduleController();
