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

  async create(req, res) {
    try {
      const body = req.body || {};
      if (!body.item_name?.trim()) return errorResponse(res, "item_name is required", 400);
      if (!body.quantity_unit?.trim()) return errorResponse(res, "quantity_unit is required", 400);
      const quantity = Number(body.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0)
        return errorResponse(res, "quantity must be a positive number", 400);
      if (body.files_product !== undefined && !Array.isArray(body.files_product))
        return errorResponse(res, "files_product must be an array", 400);
      return successResponse(res, await service.createManual({ ...body, quantity }, req.user.id,
        body.is_double_database !== false), "Inventory created", 201);
    } catch (error) { return respondError(res, error); }
  }
}

module.exports = new InventoryController();
