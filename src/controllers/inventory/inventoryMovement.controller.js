const { Op } = require("sequelize");
const service = require("../../services/inventory/inventoryMovement.service");
const approvalAccess = require("../../services/approvalFlow/approvalAccess.service");
const { successResponse, errorResponse } = require("../../utils/response");

const movementTypes = ["stock transfer", "stock allocation"];

function respondError(res, error) {
  return errorResponse(res, error.message, error.statusCode || 500);
}

function validate(body) {
  if (!movementTypes.includes(body.movement_type))
    return `movement_type must be one of: ${movementTypes.join(", ")}`;
  if (!body.id_inventory_source) return "id_inventory_source is required";
  if (!body.id_inventory_location_destination) return "id_inventory_location_destination is required";
  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return "quantity must be a positive number";
  if (body.reason != null && typeof body.reason !== "string") return "reason must be a string";
  if (body.note != null && typeof body.note !== "string") return "note must be a string";
  return null;
}

class InventoryMovementController {
  async getAll(req, res) {
    try {
      const query = req.query || {};
      const where = {};
      if (query.search)
        where[Op.or] = [
          { movement_no: { [Op.like]: `%${query.search}%` } },
          { item_name: { [Op.like]: `%${query.search}%` } },
        ];
      for (const key of ["status", "movement_type", "id_company", "id_inventory_source"])
        if (query[key]) where[key] = query[key];
      const result = await service.getAll(where, Number(query.page) || null, Number(query.limit) || null);
      return successResponse(res, await approvalAccess.attachActionFlags("inventory movement", result, req.user?.id));
    } catch (error) { return respondError(res, error); }
  }

  async getById(req, res) {
    try {
      const result = await service.getById(req.params.id);
      if (!result) return errorResponse(res, "Inventory movement not found", 404);
      return successResponse(res, await approvalAccess.attachActionFlags("inventory movement", result, req.user?.id));
    } catch (error) { return respondError(res, error); }
  }

  async create(req, res) {
    try {
      const body = req.body || {};
      const invalid = validate(body);
      if (invalid) return errorResponse(res, invalid, 400);
      return successResponse(res, await service.create(body, req.user.id,
        body.is_double_database !== false), "Inventory movement created", 201);
    } catch (error) { return respondError(res, error); }
  }

  async approve(req, res) {
    try {
      const body = req.body || {};
      return successResponse(res, await service.approve(req.params.id, req.user.id, body.note,
        body.is_double_database !== false), "Inventory movement approved");
    } catch (error) { return respondError(res, error); }
  }

  async reject(req, res) {
    try {
      const body = req.body || {};
      return successResponse(res, await service.reject(req.params.id, req.user.id, body.note,
        body.is_double_database !== false), "Inventory movement rejected");
    } catch (error) { return respondError(res, error); }
  }
}

module.exports = new InventoryMovementController();
