const service = require("../../services/purchaseRequest/purchaseRequest.service");
const { successResponse, errorResponse } = require("../../utils/response");

const procurementTypes = [
  "Pengadaan Rutin",
  "Pembaruan Stok",
  "Pengadaan Baru",
];
const editable = [
  "purchase_request_no",
  "id_company",
  "id_department",
  "id_division",
  "request_date",
  "purchase_request_category",
];

function pick(body) {
  return Object.fromEntries(
    editable
      .filter((key) => body[key] !== undefined)
      .map((key) => [key, body[key]]),
  );
}

function validateItems(items) {
  if (!Array.isArray(items) || !items.length)
    return "items must be a non-empty array";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== "object" || Array.isArray(item))
      return `items[${i}] must be an object`;
    if (!item.item_name?.trim()) return `items[${i}].item_name is required`;
    if (!item.quantity_unit?.trim())
      return `items[${i}].quantity_unit is required`;
    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)
      return `items[${i}].quantity must be positive`;
    if (!procurementTypes.includes(item.procurement_type))
      return `items[${i}].procurement_type is invalid`;
    if (item.files_product !== undefined && !Array.isArray(item.files_product))
      return `items[${i}].files_product must be an array`;
  }
  return null;
}

function respondError(res, error) {
  return errorResponse(res, error.message, error.statusCode || 500);
}

class PurchaseRequestController {
  async getNo(req, res) {
    try {
      return successResponse(
        res,
        await service.getNo(req.query?.is_double_database !== "false"),
      );
    } catch (error) {
      return respondError(res, error);
    }
  }

  async getAll(req, res) {
    try {
      const where = {};
      for (const key of [
        "id_company",
        "id_department",
        "id_division",
        "status",
        "purchase_request_category",
      ])
        if (req.query?.[key]) where[key] = req.query[key];
      return successResponse(
        res,
        await service.getAll(
          where,
          Number(req.query?.page) || null,
          Number(req.query?.limit) || null,
        ),
      );
    } catch (error) {
      return respondError(res, error);
    }
  }

  async getById(req, res) {
    try {
      const result = await service.getById(req.params.id);
      return result
        ? successResponse(res, result)
        : errorResponse(res, "Purchase request not found", 404);
    } catch (error) {
      return respondError(res, error);
    }
  }

  async getToProcessGaOrder(req, res) {
    try {
      return successResponse(
        res,
        await service.getToProcessGaOrder(req.query?.id_company),
      );
    } catch (error) {
      return respondError(res, error);
    }
  }

  async create(req, res) {
    try {
      const body = req.body || {};
      const data = pick(body);
      if (
        !data.purchase_request_no ||
        !data.id_company ||
        !data.purchase_request_category
      ) {
        return errorResponse(
          res,
          "purchase_request_no, id_company, and purchase_request_category are required",
          400,
        );
      }
      const invalid = validateItems(body.items);
      if (invalid) return errorResponse(res, invalid, 400);
      data.id_department ??= req.user.id_department ?? null;
      data.id_division ??= req.user.id_division ?? null;
      return successResponse(
        res,
        await service.create(
          data,
          body.items,
          req.user.id,
          body.is_double_database !== false,
        ),
        "Purchase request created",
        201,
      );
    } catch (error) {
      return respondError(res, error);
    }
  }

  async update(req, res) {
    try {
      const body = req.body || {};
      if (body.items !== undefined) {
        const invalid = validateItems(body.items);
        if (invalid) return errorResponse(res, invalid, 400);
      }
      return successResponse(
        res,
        await service.update(
          req.params.id,
          pick(body),
          body.items,
          req.user.id,
          body.is_double_database !== false,
        ),
        "Purchase request updated",
      );
    } catch (error) {
      return respondError(res, error);
    }
  }

  async action(req, res) {
    try {
      const body = req.body || {};
      return successResponse(
        res,
        await service.action(
          req.params.id,
          req.params.action,
          req.user.id,
          body.note,
          body.item_decisions,
          body.is_double_database !== false,
        ),
        "Purchase request status updated",
      );
    } catch (error) {
      return respondError(res, error);
    }
  }
}

module.exports = new PurchaseRequestController();
