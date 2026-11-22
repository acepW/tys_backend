const service = require("../../services/inventory/masterItem.service");
const { successResponse, errorResponse } = require("../../utils/response");

function respondError(res, error) {
  return errorResponse(res, error.message, error.statusCode || 500);
}

// partial: only validate the fields that were sent (edit).
function validate(body, partial = false) {
  const has = (key) => !partial || body[key] !== undefined;
  if (has("item_code") && !String(body.item_code ?? "").trim())
    return "item_code is required";
  if (has("item_name") && !String(body.item_name ?? "").trim())
    return "item_name is required";
  return null;
}

class MasterItemController {
  async getAll(req, res) {
    try {
      return successResponse(res, await service.getAll(req.query?.search,
        Number(req.query?.page) || null, Number(req.query?.limit) || null));
    } catch (error) { return respondError(res, error); }
  }

  async getById(req, res) {
    try {
      const result = await service.getById(req.params.id);
      return result ? successResponse(res, result) : errorResponse(res, "Master item not found", 404);
    } catch (error) { return respondError(res, error); }
  }

  async create(req, res) {
    try {
      const body = req.body || {};
      const invalid = validate(body);
      if (invalid) return errorResponse(res, invalid, 400);
      return successResponse(res, await service.create(body, body.is_double_database !== false),
        "Master item created", 201);
    } catch (error) { return respondError(res, error); }
  }

  async update(req, res) {
    try {
      const body = req.body || {};
      const invalid = validate(body, true);
      if (invalid) return errorResponse(res, invalid, 400);
      return successResponse(res, await service.update(req.params.id, body, body.is_double_database !== false),
        "Master item updated");
    } catch (error) { return respondError(res, error); }
  }

  async delete(req, res) {
    try {
      await service.remove(req.params.id, req.query?.is_double_database !== "false");
      return successResponse(res, null, "Master item deleted");
    } catch (error) { return respondError(res, error); }
  }
}

module.exports = new MasterItemController();
