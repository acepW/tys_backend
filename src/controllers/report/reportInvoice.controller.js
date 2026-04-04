const reportInvoiceService = require("../../services/report/reportInvoice.service");
const { successResponse, errorResponse } = require("../../utils/response");
const { Op } = require("sequelize");

class ReportInvoiceController {
  /**
   * Get all invoices
   */
  async getAll(req, res) {
    try {
      const { is_double_database, id_customer, search, page, limit } =
        req.query;
      const isDoubleDatabase = is_double_database !== "false";

      let obj = {};
      if (search) {
        obj = {
          [Op.or]: [{ company_name: { [Op.like]: `%${search}%` } }],
        };
      }
      if (id_customer) obj.id_customer = id_customer;

      const invoices = await reportInvoiceService.getReportInvoice(
        { where: obj },
        parseInt(page),
        parseInt(limit),
        isDoubleDatabase,
      );

      return successResponse(res, invoices, "Invoices retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new ReportInvoiceController();
