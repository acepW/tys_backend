const positionService = require("../../services/position/position.service");
const { successResponse, errorResponse } = require("../../utils/response");

const fromError = (res, error) => errorResponse(res, error.message, error.statusCode || 500);

class PositionController {
  /**
   * Get all active positions. With ?id_department= and/or ?id_division=: the
   * positions of that division, of that department without a division, and the
   * global ones.
   */
  async getAll(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      const positions = await positionService.list(
        { id_department: req.query.id_department, id_division: req.query.id_division },
        isDoubleDatabase,
      );

      return successResponse(
        res,
        positions,
        "Positions retrieved successfully",
      );
    } catch (error) {
      return fromError(res, error);
    }
  }

  async getById(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      const position = await positionService.getByIdWithMenus(
        id,
        isDoubleDatabase,
      );

      if (!position) {
        return errorResponse(res, "Position not found", 404);
      }

      return successResponse(res, position, "Position retrieved successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /**
   * Create new position (id_department / id_division optional)
   */
  async create(req, res) {
    try {
      const isDoubleDatabase = req.body.is_double_database !== false;
      const position = await positionService.createPosition(req.body, isDoubleDatabase);
      return successResponse(res, position, "Position created successfully", 201);
    } catch (error) {
      return fromError(res, error);
    }
  }

  /**
   * Update position. Sending id_department or id_division replaces both.
   */
  async update(req, res) {
    try {
      const isDoubleDatabase = req.body.is_double_database !== false;
      const position = await positionService.updatePosition(
        Number(req.params.id),
        req.body,
        isDoubleDatabase,
      );
      return successResponse(res, position, "Position updated successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }

  /**
   * Delete (deactivate) position
   */
  async delete(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      await positionService.deactivatePosition(Number(req.params.id), isDoubleDatabase);
      return successResponse(res, null, "Position deleted successfully");
    } catch (error) {
      return fromError(res, error);
    }
  }
}

module.exports = new PositionController();
