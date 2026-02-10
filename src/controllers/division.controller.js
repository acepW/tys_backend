const divisionService = require("../services/division.service");
const { successResponse, errorResponse } = require("../utils/response");

class DivisionController {
  /**
   * Get all divisions
   */
  async getAll(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      const divisions = await divisionService.findAll({}, isDoubleDatabase);

      return successResponse(
        res,
        divisions,
        "Divisions retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get division by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      const division = await divisionService.findById(id, {}, isDoubleDatabase);

      if (!division) {
        return errorResponse(res, "Division not found", 404);
      }

      return successResponse(res, division, "Division retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create new division
   */
  async create(req, res) {
    try {
      const { is_double_database, division_name } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Validation
      if (!division_name) {
        return errorResponse(res, "Division name is required", 400);
      }

      // Check if division already exists
      if (division_name) {
        const divisionExists = await divisionService.checkDivisionExists(
          division_name,
          null,
          isDoubleDatabase,
        );

        if (divisionExists) {
          return errorResponse(res, "Division already exists", 400);
        }
      }

      const data = {
        division_name: division_name,
        is_active: req.body.is_active !== undefined ? req.body.is_active : true,
      };

      const division = await divisionService.create(data, isDoubleDatabase);

      return successResponse(
        res,
        division,
        "Division created successfully",
        201,
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update customer
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, division_name } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if division exists
      const existing = await divisionService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Division not found", 404);
      }

      // Check if division name already exists
      if (division_name) {
        const divisionExists = await divisionService.checkDivisionExists(
          division_name,
          id,
          isDoubleDatabase,
        );

        if (divisionExists) {
          return errorResponse(res, "Division already exists", 400);
        }
      }

      const data = {};
      if (division_name) data.division_name = division_name;

      const division = await divisionService.update(id, data, isDoubleDatabase);

      return successResponse(res, division, "Division updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete customer
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      // Check if division exists
      const existing = await divisionService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Division not found", 404);
      }

      await divisionService.delete(id, isDoubleDatabase);

      return successResponse(res, null, "Division deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new DivisionController();
