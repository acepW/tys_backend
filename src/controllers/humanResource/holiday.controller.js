const holidayService = require("../../services/humanResource/holiday.service");
const { successResponse, errorResponse } = require("../../utils/response");
const {
  isValidDateOnly,
  normalizeYear,
  MIN_YEAR,
  MAX_YEAR,
} = require("../../utils/holidayCalendar");

const isUniqueConstraintError = (error) =>
  error?.name === "SequelizeUniqueConstraintError" ||
  error?.message?.includes("Validation error") ||
  error?.message?.includes("Duplicate entry");

class HolidayController {
  async getAll(req, res) {
    try {
      const filters = {};

      if (req.query.year !== undefined) {
        const year = normalizeYear(req.query.year);
        if (year === null) {
          return errorResponse(
            res,
            `year must be an integer between ${MIN_YEAR} and ${MAX_YEAR}`,
            400,
          );
        }
        filters.year = year;
      }

      for (const field of ["date_from", "date_to"]) {
        if (req.query[field] !== undefined) {
          if (!isValidDateOnly(req.query[field])) {
            return errorResponse(res, `${field} must use YYYY-MM-DD format`, 400);
          }
          filters[field] = req.query[field];
        }
      }

      const holidays = await holidayService.getAll(filters);
      return successResponse(res, holidays, "Holidays retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async create(req, res) {
    try {
      const holidayDate = req.body?.holiday_date ?? req.body?.date;
      const title = String(req.body?.title || "").trim();

      if (!isValidDateOnly(holidayDate)) {
        return errorResponse(res, "holiday_date must use YYYY-MM-DD format", 400);
      }
      if (!title) return errorResponse(res, "title is required", 400);
      if (title.length > 255) {
        return errorResponse(res, "title must not exceed 255 characters", 400);
      }

      const existing = await holidayService.findOne({
        where: { holiday_date: holidayDate },
      });
      if (existing) {
        return errorResponse(res, "Holiday date already exists", 409);
      }

      const holiday = await holidayService.createHoliday(
        { holiday_date: holidayDate, title },
        req.body?.is_double_database !== false,
      );
      return successResponse(res, holiday, "Holiday created successfully", 201);
    } catch (error) {
      return errorResponse(
        res,
        isUniqueConstraintError(error) ? "Holiday date already exists" : error.message,
        isUniqueConstraintError(error) ? 409 : 500,
      );
    }
  }

  async generateYear(req, res) {
    try {
      const year = normalizeYear(req.body?.year);
      if (year === null) {
        return errorResponse(
          res,
          `year must be an integer between ${MIN_YEAR} and ${MAX_YEAR}`,
          400,
        );
      }

      const result = await holidayService.generateYear(
        year,
        req.body?.is_double_database !== false,
      );
      return successResponse(
        res,
        result,
        "Weekend holidays generated successfully",
        result.created_count > 0 ? 201 : 200,
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new HolidayController();
