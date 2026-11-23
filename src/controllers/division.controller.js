const divisionService = require("../services/division.service");
const { successResponse, errorResponse } = require("../utils/response");

const fromError = (res, error) => errorResponse(res, error.message, error.statusCode || 500);

class DivisionController {
  /**
   * Get all active divisions, optionally of one department (?id_department=)
   */
  async getAll(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      const divisions = await divisionService.list(
        { id_department: req.query.id_department },
        isDoubleDatabase,
      );

      return successResponse(
        res,
        divisions,
        "Divisions retrieved successfully"
      );
    } catch (error) {
      return fromError(res, error);
    }
  }

  /**
   * Get division by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      const division = await divisionService.getById(id, isDoubleDatabase);

      if (!division) {
        return errorResponse(res, "Division not found", 404);
      }

      return successResponse(res, division, "Division retrieved successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /**
   * Create new division (id_department is required)
   */
  async create(req, res) {
    try {
      const isDoubleDatabase = req.body.is_double_database !== false;
      const division = await divisionService.createDivision(req.body, isDoubleDatabase);
      return successResponse(res, division, "Division created successfully", 201);
    } catch (error) {
      return fromError(res, error);
    }
  }

  /**
   * Update division. Changing id_department moves its positions along.
   */
  async update(req, res) {
    try {
      const isDoubleDatabase = req.body.is_double_database !== false;
      const division = await divisionService.updateDivision(
        Number(req.params.id),
        req.body,
        isDoubleDatabase,
      );
      return successResponse(res, division, "Division updated successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /**
   * Delete (deactivate) division. Needs no active positions left.
   */
  async delete(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      await divisionService.deactivateDivision(Number(req.params.id), isDoubleDatabase);
      return successResponse(res, null, "Division deleted successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }
}

module.exports = new DivisionController();
