const contractService = require("../../services/contract/contractService.service");
const { successResponse, errorResponse } = require("../../utils/response");
const { Op, where } = require("sequelize");

class ContractServiceController {
  /**
   * Get all contracts
   */
  async getAll(req, res) {
    try {
      const {
        is_double_database,
        id_company,
        id_customer,
        status,
        search,
        page,
        limit,
      } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      let obj = { is_can_processed: true };
      let objContract = {};
      if (search) {
        objContract = {
          [Op.or]: [
            { contract_no: { [Op.like]: `%${search}%` } },
            { contract_title_indo: { [Op.like]: `%${search}%` } },
            { contract_title_mandarin: { [Op.like]: `%${search}%` } },
          ],
        };
      }
      if (id_company) objContract.id_company = id_company;
      if (id_customer) objContract.id_customer = id_customer;
      if (status) obj.status = status;

      const contracts = await contractService.getAllWithRelations(
        { where: obj },
        { where: objContract },
        parseInt(page),
        parseInt(limit),
        isDoubleDatabase,
      );

      return successResponse(
        res,
        contracts,
        "Contracts Service retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get contract by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const contract = await contractService.getById(id, {}, isDoubleDatabase);

      if (!contract) {
        return errorResponse(res, "Contract not found", 404);
      }

      return successResponse(res, contract, "Contract retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new ContractServiceController();
