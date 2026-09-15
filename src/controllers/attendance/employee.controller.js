const employeeService = require("../../services/attendance/employee.service");
const { successResponse, errorResponse } = require("../../utils/response");

const editableFields = [
  "employee_code",
  "device_user_id",
  "full_name",
  "email",
  "phone",
  "id_company",
  "id_division",
  "id_department",
  "id_position",
  "hire_date",
  "termination_date",
  "is_active",
];

class EmployeeController {
  async getAll(req, res) {
    try {
      const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(
        Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
        100,
      );
      const where = {};
      if (req.query.is_active !== undefined) {
        where.is_active = req.query.is_active !== "false";
      }
      if (req.query.id_company) where.id_company = req.query.id_company;
      const employees = await employeeService.getAll(
        { where },
        page,
        limit,
        req.query.search,
      );
      return successResponse(res, employees, "Employees retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async getById(req, res) {
    try {
      const employee = await employeeService.findById(req.params.id);
      if (!employee) return errorResponse(res, "Employee not found", 404);
      return successResponse(res, employee, "Employee retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async create(req, res) {
    try {
      const { is_double_database = true } = req.body || {};
      const employeeCode = String(req.body?.employee_code || "").trim();
      const deviceUserId = String(req.body?.device_user_id || "").trim();
      const fullName = String(req.body?.full_name || "").trim();
      if (!employeeCode || !deviceUserId || !fullName) {
        return errorResponse(
          res,
          "employee_code, device_user_id, and full_name are required",
          400,
        );
      }
      const duplicate = await employeeService.findDuplicate(
        employeeCode,
        deviceUserId,
      );
      if (duplicate) {
        return errorResponse(res, "Employee code or device user ID already exists", 409);
      }
      const data = {};
      for (const field of editableFields) {
        if (req.body[field] !== undefined) data[field] = req.body[field];
      }
      data.employee_code = employeeCode;
      data.device_user_id = deviceUserId;
      data.full_name = fullName;
      data.is_active = req.body.is_active !== false;
      const employee = await employeeService.create(
        data,
        is_double_database !== false,
      );
      return successResponse(res, employee, "Employee created successfully", 201);
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async update(req, res) {
    try {
      const { is_double_database = true } = req.body || {};
      const existing = await employeeService.findById(req.params.id);
      if (!existing) return errorResponse(res, "Employee not found", 404);
      const employeeCode = String(
        req.body.employee_code ?? existing.employee_code,
      ).trim();
      const deviceUserId = String(
        req.body.device_user_id ?? existing.device_user_id,
      ).trim();
      const duplicate = await employeeService.findDuplicate(
        employeeCode,
        deviceUserId,
        req.params.id,
      );
      if (duplicate) {
        return errorResponse(res, "Employee code or device user ID already exists", 409);
      }
      const data = {};
      for (const field of editableFields) {
        if (req.body[field] !== undefined) data[field] = req.body[field];
      }
      const employee = await employeeService.update(
        req.params.id,
        data,
        is_double_database !== false,
      );
      return successResponse(res, employee, "Employee updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async delete(req, res) {
    try {
      const existing = await employeeService.findById(req.params.id);
      if (!existing) return errorResponse(res, "Employee not found", 404);
      await employeeService.update(req.params.id, { is_active: false });
      return successResponse(res, null, "Employee deactivated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new EmployeeController();
