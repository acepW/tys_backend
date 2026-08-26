const servicePricingGovernmentCostService = require("../../services/servicePricing/servicePricingGovernmentCost.service");
const { successResponse, errorResponse } = require("../../utils/response");
const { Op } = require("sequelize");

class ServicePricingGovernmentCostController {
  /**
   * Get all service pricing
   */
  async getAll(req, res) {
    try {
      const { is_double_database = true, search, page, limit } = req.query;
      const isDoubleDatabase = is_double_database;

      let obj = {};
      if (search) {
        obj = {
          [Op.or]: [
            { title_indo: { [Op.like]: `%${search}%` } },
            { title_mandarin: { [Op.like]: `%${search}%` } },
          ],
        };
      }
      obj.is_active = true;

      const servicePricing =
        await servicePricingGovernmentCostService.getAllWithRelations(
          { where: obj },
          parseInt(page),
          parseInt(limit),
          isDoubleDatabase,
        );

      return successResponse(
        res,
        servicePricing,
        "Service pricing retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new ServicePricingGovernmentCostController();
