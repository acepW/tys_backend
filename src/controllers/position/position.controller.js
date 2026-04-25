const { where } = require("sequelize");
const positionService = require("../../services/position/position.service");
const { successResponse, errorResponse } = require("../../utils/response");

class PositionController {
  /**
   * Get all positions
   */
  async getAll(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      const positions = await positionService.findAll(
        { where: { is_active: true } },
        isDoubleDatabase,
      );

      return successResponse(
        res,
        positions,
        "Positions retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
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
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create new position
   */
  async create(req, res) {
    try {
      const { is_double_database, position_name } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Validation
      if (!position_name) {
        return errorResponse(res, "Position name is required", 400);
      }

      // Check if position already exists
      const positionExists = await positionService.checkPositionExists(
        position_name,
        null,
        isDoubleDatabase,
      );

      if (positionExists) {
        return errorResponse(res, "Position already exists", 400);
      }

      const data = {
        position_name: position_name,
        is_active: req.body.is_active !== undefined ? req.body.is_active : true,
      };

      const position = await positionService.create(data, isDoubleDatabase);

      return successResponse(
        res,
        position,
        "Position created successfully",
        201,
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update position
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, position_name } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if position exists
      const existing = await positionService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Position not found", 404);
      }

      // Check if position name already exists (exclude current id)
      if (position_name) {
        const positionExists = await positionService.checkPositionExists(
          position_name,
          id,
          isDoubleDatabase,
        );

        if (positionExists) {
          return errorResponse(res, "Position already exists", 400);
        }
      }

      const data = {};
      if (position_name) data.position_name = position_name;
      if (req.body.is_active !== undefined) data.is_active = req.body.is_active;

      const position = await positionService.update(id, data, isDoubleDatabase);

      return successResponse(res, position, "Position updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete position
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      // Check if position exists
      const existing = await positionService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Position not found", 404);
      }

      await positionService.update(id, { is_active: false }, isDoubleDatabase);

      return successResponse(res, null, "Position deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new PositionController();
