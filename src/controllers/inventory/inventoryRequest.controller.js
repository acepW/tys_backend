const { Op } = require("sequelize");
const service = require("../../services/inventory/inventoryRequest.service");
const approvalAccess = require("../../services/approvalFlow/approvalAccess.service");
const { successResponse, errorResponse } = require("../../utils/response");

function respondError(res, error) {
  return errorResponse(res, error.message, error.statusCode || 500);
}

// partial: only validate the fields that were sent (edit).
function validate(body, partial = false) {
  const has = (key) => !partial || body[key] !== undefined;
  if (has("item_name") && !body.item_name?.trim()) return "item_name is required";
  if (has("quantity_unit") && !body.quantity_unit?.trim()) return "quantity_unit is required";
  if (has("quantity")) {
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return "quantity must be a positive number";
  }
  if (body.files_product !== undefined && !Array.isArray(body.files_product))
    return "files_product must be an array";
  if (body.asset_category != null && !["asset", "non asset"].includes(body.asset_category))
    return "asset_category must be asset or non asset";
  return null;
}

class InventoryRequestController {
  async getAll(req, res) {
    try {
      const where = {};
      if (req.query?.search) where.item_name = { [Op.like]: `%${req.query.search}%` };
      if (req.query?.status) where.status = req.query.status;
      const result = await service.getAll(where, Number(req.query?.page) || null, Number(req.query?.limit) || null);
      return successResponse(res, await approvalAccess.attachActionFlags("inventory request", result, req.user?.id));
    } catch (error) { return respondError(res, error); }
  }

  async getById(req, res) {
    try {
      const result = await service.getById(req.params.id);
      if (!result) return errorResponse(res, "Inventory request not found", 404);
      return successResponse(res, await approvalAccess.attachActionFlags("inventory request", result, req.user?.id));
    } catch (error) { return respondError(res, error); }
  }

  async create(req, res) {
    try {
      const body = req.body || {};
      const invalid = validate(body);
      if (invalid) return errorResponse(res, invalid, 400);
      return successResponse(res, await service.create(body, req.user.id,
        body.is_double_database !== false), "Inventory request created", 201);
    } catch (error) { return respondError(res, error); }
  }

  async update(req, res) {
    try {
      const body = req.body || {};
      const invalid = validate(body, true);
      if (invalid) return errorResponse(res, invalid, 400);
      return successResponse(res, await service.update(req.params.id, body, req.user.id,
        body.is_double_database !== false), "Inventory request updated");
    } catch (error) { return respondError(res, error); }
  }

  async approve(req, res) {
    try {
      const body = req.body || {};
      return successResponse(res, await service.approve(req.params.id, req.user.id, body.note,
        body.is_double_database !== false), "Inventory request approved");
    } catch (error) { return respondError(res, error); }
  }

  async reject(req, res) {
    try {
      const body = req.body || {};
      return successResponse(res, await service.reject(req.params.id, req.user.id, body.note,
        body.is_double_database !== false), "Inventory request rejected");
    } catch (error) { return respondError(res, error); }
  }
}

module.exports = new InventoryRequestController();
