const departmentService = require("../../services/department/department.service");
const { successResponse, errorResponse } = require("../../utils/response");

class DepartmentController {
  /**
   * Get all departments
   */
  async getAll(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      const departments = await departmentService.findAll(
        { where: { is_active: true } },
        isDoubleDatabase,
      );

      return successResponse(
        res,
        departments,
        "Departments retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get department by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      const department = await departmentService.findById(
        id,
        {},
        isDoubleDatabase,
      );

      if (!department) {
        return errorResponse(res, "Department not found", 404);
      }

      return successResponse(
        res,
        department,
        "Department retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create new department
   */
  async create(req, res) {
    try {
      const { is_double_database, department_name } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Validation
      if (!department_name) {
        return errorResponse(res, "Department name is required", 400);
      }

      // Check if department already exists
      const departmentExists = await departmentService.checkDepartmentExists(
        department_name,
        null,
        isDoubleDatabase,
      );

      if (departmentExists) {
        return errorResponse(res, "Department already exists", 400);
      }

      const data = {
        department_name: department_name,
        is_active: req.body.is_active !== undefined ? req.body.is_active : true,
      };

      const department = await departmentService.create(data, isDoubleDatabase);

      return successResponse(
        res,
        department,
        "Department created successfully",
        201,
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update department
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true, department_name } = req.body;
      const isDoubleDatabase = is_double_database;

      // Check if department exists
      const existing = await departmentService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Department not found", 404);
      }

      // Check if department name already exists (exclude current id)
      if (department_name) {
        const departmentExists = await departmentService.checkDepartmentExists(
          department_name,
          id,
          isDoubleDatabase,
        );

        if (departmentExists) {
          return errorResponse(res, "Department already exists", 400);
        }
      }

      const data = {};
      if (department_name) data.department_name = department_name;
      if (req.body.is_active !== undefined) data.is_active = req.body.is_active;

      const department = await departmentService.update(
        id,
        data,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        department,
        "Department updated successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete department
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      // Check if department exists
      const existing = await departmentService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Department not found", 404);
      }

      await departmentService.update(
        id,
        { is_active: false },
        isDoubleDatabase,
      );

      return successResponse(res, null, "Department deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new DepartmentController();
