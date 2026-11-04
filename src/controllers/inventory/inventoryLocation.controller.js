const service = require("../../services/inventory/inventoryLocation.service");
const { successResponse, errorResponse } = require("../../utils/response");

function respondError(res, error) {
  return errorResponse(res, error.message, error.statusCode || 500);
}

// partial: only validate the fields that were sent (edit).
function validate(body, partial = false) {
  const has = (key) => !partial || body[key] !== undefined;
  if (has("location_code") && !String(body.location_code ?? "").trim())
    return "location_code is required";
  if (has("location_name") && !String(body.location_name ?? "").trim())
    return "location_name is required";
  return null;
}

class InventoryLocationController {
  async getAll(req, res) {
    try {
      return successResponse(res, await service.getAll(req.query?.search,
        Number(req.query?.page) || null, Number(req.query?.limit) || null));
    } catch (error) { return respondError(res, error); }
  }

  async getById(req, res) {
    try {
      const result = await service.getById(req.params.id);
      return result ? successResponse(res, result) : errorResponse(res, "Inventory location not found", 404);
    } catch (error) { return respondError(res, error); }
  }

  async create(req, res) {
    try {
      const body = req.body || {};
      const invalid = validate(body);
      if (invalid) return errorResponse(res, invalid, 400);
      return successResponse(res, await service.create(body, body.is_double_database !== false),
        "Inventory location created", 201);
    } catch (error) { return respondError(res, error); }
  }

  async update(req, res) {
    try {
      const body = req.body || {};
      const invalid = validate(body, true);
      if (invalid) return errorResponse(res, invalid, 400);
      return successResponse(res, await service.update(req.params.id, body, body.is_double_database !== false),
        "Inventory location updated");
    } catch (error) { return respondError(res, error); }
  }

  async delete(req, res) {
    try {
      await service.remove(req.params.id, req.query?.is_double_database !== "false");
      return successResponse(res, null, "Inventory location deleted");
    } catch (error) { return respondError(res, error); }
  }
}

module.exports = new InventoryLocationController();
