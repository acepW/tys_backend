const levelService = require("../services/level.service");
const { successResponse, errorResponse } = require("../utils/response");

class LevelController {
  /**
   * Get all levels
   */
  async getAll(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      const levels = await levelService.findAll(
        { where: { is_active: true }, order: [["level_name", "ASC"]] },
        isDoubleDatabase,
      );

      return successResponse(res, levels, "Levels retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get level by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      const level = await levelService.findById(id, {}, isDoubleDatabase);
      if (!level) {
        return errorResponse(res, "Level not found", 404);
      }

      return successResponse(res, level, "Level retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create new level
   */
  async create(req, res) {
    try {
      const { is_double_database, level_name } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      if (!level_name?.trim()) {
        return errorResponse(res, "Level name is required", 400);
      }

      if (await levelService.checkLevelExists(level_name.trim(), null, isDoubleDatabase)) {
        return errorResponse(res, "Level already exists", 400);
      }

      const data = {
        level_name: level_name.trim(),
        is_active: req.body.is_active !== undefined ? req.body.is_active : true,
      };

      const level = await levelService.create(data, isDoubleDatabase);

      return successResponse(res, level, "Level created successfully", 201);
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update level
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, level_name } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      const existing = await levelService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Level not found", 404);
      }

      if (level_name !== undefined && !level_name?.trim()) {
        return errorResponse(res, "Level name is required", 400);
      }
      if (level_name && (await levelService.checkLevelExists(level_name.trim(), id, isDoubleDatabase))) {
        return errorResponse(res, "Level already exists", 400);
      }

      const data = {};
      if (level_name) data.level_name = level_name.trim();
      if (req.body.is_active !== undefined) data.is_active = req.body.is_active;

      const level = await levelService.update(id, data, isDoubleDatabase);

      return successResponse(res, level, "Level updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete level (soft delete)
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      const existing = await levelService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Level not found", 404);
      }

      await levelService.update(id, { is_active: false }, isDoubleDatabase);

      return successResponse(res, null, "Level deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new LevelController();
