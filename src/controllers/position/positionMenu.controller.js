const positionMenuService = require("../../services/position/positionMenu.service");
const menuService = require("../../services/menu.service");
const { successResponse, errorResponse } = require("../../utils/response");

class PositionMenuController {
  /**
   * GET /position-menu/:id_position
   * Ambil semua permission menu untuk 1 position
   */
  async getByPosition(req, res) {
    try {
      const { id_position } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      const data = await positionMenuService.getByPosition(
        id_position,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        data,
        "Position menu permissions retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * PUT /position-menu/:id_position/:id_menu
   * Update 1 permission entry
   */
  async updatePermission(req, res) {
    try {
      const { id_position, id_menu } = req.params;
      const { is_double_database, ...data } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      const record = await positionMenuService.updatePermission(
        id_position,
        id_menu,
        data,
        isDoubleDatabase,
      );

      return successResponse(res, record, "Permission updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * PUT /position-menu/:id_position/bulk
   * Bulk update semua permission untuk 1 position
   * Body: { permissions: [{ id_menu, is_active, is_can_view, ... }] }
   */
  async bulkUpdate(req, res) {
    try {
      const { id_position } = req.params;
      const { is_double_database, permissions } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      if (!permissions || !Array.isArray(permissions)) {
        return errorResponse(res, "permissions must be an array", 400);
      }

      const results = await positionMenuService.bulkUpdatePermissions(
        id_position,
        permissions,
        isDoubleDatabase,
      );

      return successResponse(res, results, "Permissions updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new PositionMenuController();
