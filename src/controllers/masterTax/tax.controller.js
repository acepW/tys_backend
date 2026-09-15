const taxService = require("../../services/masterTax/tax.service");
const { successResponse, errorResponse } = require("../../utils/response");

const normalizeCode = (code) => String(code || "").trim().toUpperCase();
const parseRate = (rate) => {
  const parsed = Number(rate);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
    ? parsed
    : null;
};

class TaxController {
  async getAll(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      const taxes = await taxService.findAll(
        { order: [["code", "ASC"]] },
        isDoubleDatabase,
      );
      return successResponse(res, taxes, "Taxes retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async getById(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      const tax = await taxService.findById(req.params.id, {}, isDoubleDatabase);
      if (!tax) return errorResponse(res, "Tax not found", 404);
      return successResponse(res, tax, "Tax retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async create(req, res) {
    try {
      const { is_double_database = true, name, rate } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;
      const code = normalizeCode(req.body?.code);
      const parsedRate = parseRate(rate);

      if (!code || !name) {
        return errorResponse(res, "code and name are required", 400);
      }
      if (parsedRate === null) {
        return errorResponse(res, "rate must be between 0 and 100", 400);
      }
      const existing = await taxService.findOne({ where: { code } }, true);
      if (existing) return errorResponse(res, "Tax code already exists", 409);

      const tax = await taxService.create(
        { code, name, rate: parsedRate, is_active: true },
        isDoubleDatabase,
      );
      return successResponse(res, tax, "Tax created successfully", 201);
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async update(req, res) {
    try {
      const { is_double_database = true, name, rate, is_active } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;
      const existing = await taxService.findById(req.params.id, {}, true);
      if (!existing) return errorResponse(res, "Tax not found", 404);

      const data = {};
      if (name !== undefined) {
        if (!String(name).trim()) return errorResponse(res, "name is required", 400);
        data.name = name;
      }
      if (rate !== undefined) {
        const parsedRate = parseRate(rate);
        if (parsedRate === null) {
          return errorResponse(res, "rate must be between 0 and 100", 400);
        }
        data.rate = parsedRate;
      }
      if (is_active !== undefined) data.is_active = is_active === true;

      const tax = await taxService.update(req.params.id, data, isDoubleDatabase);
      return successResponse(res, tax, "Tax updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async delete(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      const existing = await taxService.findById(req.params.id, {}, true);
      if (!existing) return errorResponse(res, "Tax not found", 404);
      await taxService.update(req.params.id, { is_active: false }, isDoubleDatabase);
      return successResponse(res, null, "Tax deactivated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new TaxController();
