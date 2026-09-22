const employeeService = require("../../services/humanResource/employee.service");
const { successResponse, errorResponse } = require("../../utils/response");
const {
  isValidDateOnly,
  calculateContractReminderDate,
} = require("../../utils/employeeContract");

const editableFields = [
  "employee_code",
  "device_user_id",
  "full_name",
  "address",
  "email",
  "phone",
  "ktp",
  "npwp",
  "id_company",
  "id_division",
  "id_department",
  "id_position",
  "hire_date",
  "contract_start_date",
  "contract_end_date",
  "contract_reminder_days",
  "termination_date",
  "is_active",
];

const relationFields = [
  "emergency_contacts",
  "contract_documents",
  "employee_photos",
];

const validateRelations = (body) => {
  for (const field of relationFields) {
    if (body[field] !== undefined && !Array.isArray(body[field])) {
      return `${field} must be an array`;
    }
  }

  for (const [index, contact] of (body.emergency_contacts || []).entries()) {
    if (
      !String(contact?.name || "").trim() ||
      !String(contact?.address || "").trim() ||
      !String(contact?.contact_number || "").trim()
    ) {
      return `emergency_contacts[${index}] requires name, address, and contact_number`;
    }
  }
  return null;
};

const applyContractReminder = (data, existing = null) => {
  const dateFields = [
    "hire_date",
    "termination_date",
    "contract_start_date",
    "contract_end_date",
  ];
  for (const field of dateFields) {
    const value = data[field] !== undefined ? data[field] : existing?.[field];
    if (!isValidDateOnly(value)) {
      const error = new Error(`${field} must use YYYY-MM-DD format`);
      error.statusCode = 400;
      throw error;
    }
  }

  const reminderDays = Number(
    data.contract_reminder_days ?? existing?.contract_reminder_days ?? 60,
  );
  if (!Number.isInteger(reminderDays) || reminderDays < 0) {
    const error = new Error("contract_reminder_days must be a positive integer");
    error.statusCode = 400;
    throw error;
  }

  const startDate =
    data.contract_start_date !== undefined
      ? data.contract_start_date
      : existing?.contract_start_date;
  const endDate =
    data.contract_end_date !== undefined
      ? data.contract_end_date
      : existing?.contract_end_date;
  if (startDate && endDate && startDate > endDate) {
    const error = new Error(
      "contract_end_date must be on or after contract_start_date",
    );
    error.statusCode = 400;
    throw error;
  }

  data.contract_reminder_days = reminderDays;
  data.contract_reminder_date = calculateContractReminderDate(
    endDate,
    reminderDays,
  );
};

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
      const employee = await employeeService.getById(req.params.id);
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
      const relationError = validateRelations(req.body || {});
      if (relationError) return errorResponse(res, relationError, 400);
      const duplicate = await employeeService.findDuplicate(
        employeeCode,
        deviceUserId,
      );
      if (duplicate) {
        return errorResponse(
          res,
          "Employee code or device user ID already exists",
          409,
        );
      }
      const data = {};
      for (const field of editableFields) {
        if (req.body[field] !== undefined) data[field] = req.body[field];
      }
      data.employee_code = employeeCode;
      data.device_user_id = deviceUserId;
      data.full_name = fullName;
      data.is_active = req.body.is_active !== false;
      applyContractReminder(data);
      const relations = Object.fromEntries(
        relationFields.map((field) => [field, req.body[field] || []]),
      );
      const employee = await employeeService.createWithRelations(
        data,
        relations,
        req.user.id,
        is_double_database !== false,
      );
      return successResponse(
        res,
        employee,
        "Employee created successfully",
        201,
      );
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 500);
    }
  }

  async update(req, res) {
    try {
      const { is_double_database = true } = req.body || {};
      const existing = await employeeService.getById(req.params.id);
      if (!existing) return errorResponse(res, "Employee not found", 404);
      const relationError = validateRelations(req.body || {});
      if (relationError) return errorResponse(res, relationError, 400);
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
        return errorResponse(
          res,
          "Employee code or device user ID already exists",
          409,
        );
      }
      const data = {};
      for (const field of editableFields) {
        if (req.body[field] !== undefined) data[field] = req.body[field];
      }
      applyContractReminder(data, existing);
      const relations = {};
      for (const field of relationFields) {
        if (req.body[field] !== undefined) relations[field] = req.body[field];
      }
      const employee = await employeeService.updateWithRelations(
        req.params.id,
        data,
        relations,
        req.user.id,
        is_double_database !== false,
      );
      return successResponse(res, employee, "Employee updated successfully");
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 500);
    }
  }

  async delete(req, res) {
    try {
      const existing = await employeeService.getById(req.params.id);
      if (!existing) return errorResponse(res, "Employee not found", 404);
      await employeeService.update(req.params.id, { is_active: false });
      return successResponse(res, null, "Employee deactivated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new EmployeeController();
