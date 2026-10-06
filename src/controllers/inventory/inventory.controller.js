const { Op } = require("sequelize");
const service = require("../../services/inventory/inventory.service");
const { successResponse, errorResponse } = require("../../utils/response");

function respondError(res, error) {
  return errorResponse(res, error.message, error.statusCode || 500);
}

class InventoryController {
  async getAll(req, res) {
    try {
      const where = {};
      if (req.query?.search) where.item_name = { [Op.like]: `%${req.query.search}%` };
      if (req.query?.purchase_request_category)
        where.purchase_request_category = req.query.purchase_request_category;
      return successResponse(res, await service.getAll(where, Number(req.query?.page) || null, Number(req.query?.limit) || null));
    } catch (error) { return respondError(res, error); }
  }

  async getById(req, res) {
    try {
      const result = await service.getById(req.params.id);
      return result ? successResponse(res, result) : errorResponse(res, "Inventory not found", 404);
    } catch (error) { return respondError(res, error); }
  }
}

module.exports = new InventoryController();
