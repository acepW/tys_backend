const attendanceService = require("../../services/humanResource/attendance.service");
const employeeService = require("../../services/humanResource/employee.service");
const { successResponse, errorResponse } = require("../../utils/response");

const pagination = (query) => ({
  page: Math.max(Number.parseInt(query.page, 10) || 1, 1),
  limit: Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100),
});

class AttendanceController {
  async getLogs(req, res) {
    try {
      const { page, limit } = pagination(req.query);
      const result = await attendanceService.getLogs(req.query, page, limit);
      return successResponse(res, result, "Attendance logs retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async getSummaries(req, res) {
    try {
      const { page, limit } = pagination(req.query);
      const result = await attendanceService.getSummaries(req.query, page, limit);
      return successResponse(res, result, "Attendances retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async reprocessEmployee(req, res) {
    try {
      const employee = await employeeService.findById(req.params.employee_id);
      if (!employee) return errorResponse(res, "Employee not found", 404);
      const result = await attendanceService.reprocessEmployee(
        employee.id,
        employee.device_user_id,
        req.body?.is_double_database !== false,
      );
      return successResponse(
        res,
        result,
        "Unmatched attendance logs reprocessed successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new AttendanceController();
