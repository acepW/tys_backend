const departmentService = require("../../services/department/department.service");
const { successResponse, errorResponse } = require("../../utils/response");

const fromError = (res, error) => errorResponse(res, error.message, error.statusCode || 500);

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
      return fromError(res, error);
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
      return fromError(res, error);
    }
  }

  /**
   * Create new department
   */
  async create(req, res) {
    try {
      const isDoubleDatabase = req.body.is_double_database !== false;
      const department = await departmentService.createDepartment(req.body, isDoubleDatabase);
      return successResponse(res, department, "Department created successfully", 201);
    } catch (error) {
      return fromError(res, error);
    }
  }

  /**
   * Update department. Deactivating needs no active divisions or positions left.
   */
  async update(req, res) {
    try {
      const isDoubleDatabase = req.body.is_double_database !== false;
      const department = await departmentService.updateDepartment(
        Number(req.params.id),
        req.body,
        isDoubleDatabase,
      );
      return successResponse(res, department, "Department updated successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /**
   * Delete (deactivate) department. Needs no active divisions or positions left.
   */
  async delete(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      await departmentService.deactivateDepartment(Number(req.params.id), isDoubleDatabase);
      return successResponse(res, null, "Department deleted successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }
}

module.exports = new DepartmentController();
