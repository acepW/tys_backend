const menuService = require("../services/menu.service");
const { successResponse, errorResponse } = require("../utils/response");

class MenuController {
  /**
   * GET /menus
   * Ambil semua menu nested (parent + sub_items), hanya yang is_active
   */
  async getAll(req, res) {
    try {
      const { is_double_database = true } = req.query || {};
      const isDoubleDatabase = is_double_database;

      const menus = await menuService.getAllMenus(isDoubleDatabase);

      return successResponse(res, menus, "Menus retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * GET /menus/:id
   * Ambil detail satu menu by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true } = req.query || {};
      const isDoubleDatabase = is_double_database;
      const menu = await menuService.getMenuById(id, isDoubleDatabase);

      if (!menu) {
        return errorResponse(res, "Menu not found", 404);
      }

      return successResponse(res, menu, "Menu retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * POST /menus
   * Tambah menu baru (parent atau sub-item)
   * Body: { label, icon, path, parent_id, order_index }
   */
  async create(req, res) {
    try {
      const {
        is_double_database = true,
        label,
        icon,
        path,
        parent_id,
        order_index,
      } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Validation
      if (!label) {
        return errorResponse(res, "Label is required", 400);
      }

      // Jika sub-item, path wajib diisi
      if (parent_id && !path) {
        return errorResponse(res, "Path is required for sub-item", 400);
      }

      // Cek duplikat label di level yang sama
      const labelExists = await menuService.checkLabelExists(
        label,
        parent_id ?? null,
        null,
        isDoubleDatabase,
      );
      if (labelExists) {
        return errorResponse(
          res,
          "Menu with this label already exists at the same level",
          400,
        );
      }

      const data = {
        label,
        icon: icon ?? null,
        path: path ?? null,
        parent_id: parent_id ?? null,
        order_index: order_index ?? 0,
        is_active: true,
      };

      const menu = await menuService.createMenu(data, isDoubleDatabase);

      return successResponse(res, menu, "Menu created successfully", 201);
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * PUT /menus/:id
   * Update menu
   * Body: { label, icon, path, order_index, is_active }
   * Catatan: parent_id tidak bisa diubah untuk menghindari restrukturisasi hierarki
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        is_double_database = true,
        label,
        icon,
        path,
        order_index,
        is_active,
      } = req.body;
      const isDoubleDatabase = is_double_database;

      // Cek menu exist
      const existing = await menuService.getMenuById(id, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Menu not found", 404);
      }

      // Cek duplikat label di level yang sama (exclude diri sendiri)
      if (label) {
        const labelExists = await menuService.checkLabelExists(
          label,
          existing.parent_id,
          id,
          isDoubleDatabase,
        );
        if (labelExists) {
          return errorResponse(
            res,
            "Menu with this label already exists at the same level",
            400,
          );
        }
      }

      const data = {};
      if (label !== undefined) data.label = label;
      if (icon !== undefined) data.icon = icon;
      if (path !== undefined) data.path = path;
      if (order_index !== undefined) data.order_index = order_index;
      if (is_active !== undefined) data.is_active = is_active;

      const menu = await menuService.updateMenu(id, data, isDoubleDatabase);

      return successResponse(res, menu, "Menu updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * DELETE /menus/:id
   * Soft delete menu (is_active = false)
   * Jika parent, sub_items ikut di-soft delete
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      const existing = await menuService.getMenuById(id, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Menu not found", 404);
      }

      await menuService.deleteMenu(id, isDoubleDatabase);

      return successResponse(res, null, "Menu deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * POST /menus/seed
   * Jalankan seeder menu — hanya untuk initial setup
   */
  async seed(req, res) {
    try {
      const { is_double_database = true } = req.query || {};
      const isDoubleDatabase = is_double_database;

      const result = await menuService.runSeeder(isDoubleDatabase);

      return successResponse(
        res,
        result,
        `Seeder ran successfully. Menus: ${result.menus_inserted}, Position menus synced: ${result.position_menus_synced}`,
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new MenuController();
