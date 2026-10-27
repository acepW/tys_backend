const { Op } = require("sequelize");
const service = require("../../services/inventory/inventoryOpname.service");
const approvalAccess = require("../../services/approvalFlow/approvalAccess.service");
const { successResponse, errorResponse } = require("../../utils/response");

function respondError(res, error) {
  return errorResponse(res, error.message, error.statusCode || 500);
}

// Checks items is a non-empty array of objects with unique positive integer ids,
// then runs check(item) on each; returns the first error message or null.
function validateItems(items, check) {
  if (!Array.isArray(items) || !items.length) return "items must be a non-empty array";
  const seen = new Set();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== "object") return `items[${i}] must be an object`;
    const id = Number(item.id);
    if (!Number.isInteger(id) || id <= 0) return `items[${i}].id must be a positive integer`;
    if (seen.has(id)) return "items contains duplicate ids";
    seen.add(id);
    const invalid = check(item);
    if (invalid) return `items[${i}]: ${invalid}`;
  }
  return null;
}

function checkCount(item) {
  const quantity = Number(item.quantity_actual);
  if (item.quantity_actual == null || item.quantity_actual === "" || !Number.isFinite(quantity) || quantity < 0)
    return "quantity_actual must be a non-negative number";
  if (item.input_status != null && typeof item.input_status !== "string") return "input_status must be a string";
  if (item.details === undefined) return null;
  if (!Array.isArray(item.details)) return "details must be an array";
  for (let i = 0; i < item.details.length; i++) {
    const detail = item.details[i];
    if (!detail || typeof detail !== "object") return `details[${i}] must be an object`;
    const detailQuantity = Number(detail.quantity);
    if (detail.quantity == null || detail.quantity === "" || !Number.isFinite(detailQuantity) || detailQuantity < 0)
      return `details[${i}].quantity must be a non-negative number`;
    if (typeof detail.input_status !== "string" || !detail.input_status.trim())
      return `details[${i}].input_status is required`;
    if (detail.note != null && typeof detail.note !== "string") return `details[${i}].note must be a string`;
  }
  return null;
}

function checkReview(item) {
  if (!["approve", "reject"].includes(item.decision)) return "decision must be approve or reject";
  if (item.decision === "reject" && !item.note?.trim()) return "note is required for rejection";
  return null;
}

const page = (req) => [Number(req.query?.page) || null, Number(req.query?.limit) || null];

class InventoryOpnameController {
  async getAll(req, res) {
    try {
      const where = {};
      if (req.query?.search) where.opname_no = { [Op.like]: `%${req.query.search}%` };
      if (req.query?.status) where.status = req.query.status;
      const result = await service.getAll(where, ...page(req));
      return successResponse(res, await approvalAccess.attachActionFlags("inventory opname", result, req.user?.id));
    } catch (error) { return respondError(res, error); }
  }

  async getById(req, res) {
    try {
      const result = await service.getById(req.params.id);
      if (!result) return errorResponse(res, "Inventory opname not found", 404);
      return successResponse(res, await approvalAccess.attachActionFlags("inventory opname", result, req.user?.id));
    } catch (error) { return respondError(res, error); }
  }

  async getItems(req, res) {
    try {
      const where = {};
      if (req.query?.search) where.item_name = { [Op.like]: `%${req.query.search}%` };
      if (req.query?.status) where.status = req.query.status;
      if (req.query?.purchase_request_category)
        where.purchase_request_category = req.query.purchase_request_category;
      return successResponse(res, await service.getItems(req.params.id, where, ...page(req)));
    } catch (error) { return respondError(res, error); }
  }

  async create(req, res) {
    try {
      const body = req.body || {};
      return successResponse(res, await service.create(body, req.user.id,
        body.is_double_database !== false), "Inventory opname created", 201);
    } catch (error) { return respondError(res, error); }
  }

  async saveItems(req, res) {
    try {
      const body = req.body || {};
      const invalid = validateItems(body.items, checkCount);
      if (invalid) return errorResponse(res, invalid, 400);
      return successResponse(res, await service.saveItems(req.params.id, body.items, req.user.id,
        body.is_double_database !== false), "Inventory opname items saved");
    } catch (error) { return respondError(res, error); }
  }

  async request(req, res) {
    try {
      const body = req.body || {};
      return successResponse(res, await service.request(req.params.id, req.user.id, body.note,
        body.is_double_database !== false), "Inventory opname requested");
    } catch (error) { return respondError(res, error); }
  }

  async reviewItems(req, res) {
    try {
      const body = req.body || {};
      const invalid = validateItems(body.items, checkReview);
      if (invalid) return errorResponse(res, invalid, 400);
      return successResponse(res, await service.reviewItems(req.params.id, body.items, req.user.id,
        body.is_double_database !== false), "Inventory opname items reviewed");
    } catch (error) { return respondError(res, error); }
  }

  async approve(req, res) {
    try {
      const body = req.body || {};
      return successResponse(res, await service.approve(req.params.id, req.user.id, body.note,
        body.is_double_database !== false), "Inventory opname approved");
    } catch (error) { return respondError(res, error); }
  }

  async cancel(req, res) {
    try {
      await service.cancel(req.params.id, req.user.id, req.body?.is_double_database !== false);
      return successResponse(res, null, "Inventory opname cancelled");
    } catch (error) { return respondError(res, error); }
  }
}

module.exports = new InventoryOpnameController();
