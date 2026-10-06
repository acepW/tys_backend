const service = require("../../services/gaPurchaseOrder/gaPurchaseOrder.service");
const { successResponse, errorResponse } = require("../../utils/response");

function respondError(res, error) {
  return errorResponse(res, error.message, error.statusCode || 500);
}

function validateItems(items) {
  if (!Array.isArray(items) || !items.length) return "items must be a non-empty array";
  const seen = new Set();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || !Number.isInteger(Number(item.id_purchase_request_item)) || Number(item.id_purchase_request_item) <= 0)
      return `items[${i}].id_purchase_request_item must be a positive integer`;
    if (seen.has(Number(item.id_purchase_request_item))) return "items contains duplicate purchase request items";
    seen.add(Number(item.id_purchase_request_item));
    for (const key of ["files_product", "files_attachment"])
      if (item[key] !== undefined && !Array.isArray(item[key])) return `items[${i}].${key} must be an array`;
  }
  return null;
}

function validateFileArrays(body) {
  for (const key of ["files_payment", "files_purchase_proof", "files_goods_receipt"])
    if (body[key] !== undefined && !Array.isArray(body[key])) return `${key} must be an array`;
  return null;
}

class GaPurchaseOrderController {
  async getNo(req, res) {
    try { return successResponse(res, await service.getNo(req.query?.is_double_database !== "false")); }
    catch (error) { return respondError(res, error); }
  }

  async getAll(req, res) {
    try {
      const where = {};
      for (const key of ["id_company", "status"]) if (req.query?.[key]) where[key] = req.query[key];
      return successResponse(res, await service.getAll(where, Number(req.query?.page) || null, Number(req.query?.limit) || null));
    } catch (error) { return respondError(res, error); }
  }

  async getById(req, res) {
    try {
      const result = await service.getById(req.params.id);
      return result ? successResponse(res, result) : errorResponse(res, "GA purchase order not found", 404);
    } catch (error) { return respondError(res, error); }
  }

  async create(req, res) {
    try {
      const body = req.body || {};
      if (!body.ga_purchase_order_no) return errorResponse(res, "ga_purchase_order_no is required", 400);
      const invalid = validateItems(body.items);
      if (invalid) return errorResponse(res, invalid, 400);
      if (body.file_attachment !== undefined && !Array.isArray(body.file_attachment))
        return errorResponse(res, "file_attachment must be an array", 400);
      return successResponse(res, await service.create(body, body.items, req.user.id,
        body.is_double_database !== false), "GA purchase order created", 201);
    } catch (error) { return respondError(res, error); }
  }

  async update(req, res) {
    try {
      const body = req.body || {};
      if (body.items !== undefined) {
        const invalid = validateItems(body.items);
        if (invalid) return errorResponse(res, invalid, 400);
      }
      if (body.file_attachment !== undefined && !Array.isArray(body.file_attachment))
        return errorResponse(res, "file_attachment must be an array", 400);
      return successResponse(res, await service.update(req.params.id, body, body.items,
        req.user.id, body.is_double_database !== false), "GA purchase order updated");
    } catch (error) { return respondError(res, error); }
  }

  async updateReceiving(req, res) {
    try {
      const body = req.body || {};
      const invalid = validateFileArrays(body);
      if (invalid) return errorResponse(res, invalid, 400);
      return successResponse(res, await service.updateReceiving(req.params.id, body, req.user.id,
        body.is_double_database !== false), "GA purchase order receiving updated");
    } catch (error) { return respondError(res, error); }
  }

  async action(req, res) {
    try {
      const body = req.body || {};
      const invalid = validateFileArrays(body);
      if (invalid) return errorResponse(res, invalid, 400);
      return successResponse(res, await service.action(req.params.id, req.params.action,
        req.user.id, body, body.is_double_database !== false), "GA purchase order status updated");
    } catch (error) { return respondError(res, error); }
  }
}

module.exports = new GaPurchaseOrderController();
