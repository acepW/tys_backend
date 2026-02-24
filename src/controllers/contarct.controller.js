const contractService = require("../services/contract/contract.service");
const paymentService = require("../services/contract/contractPayment.service");
const { successResponse, errorResponse } = require("../utils/response");
const { Op } = require("sequelize");

class ContractController {
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
        contract_type,
        search,
      } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      let obj = {};
      if (search) {
        obj = {
          [Op.or]: [
            { contract_no: { [Op.like]: `%${search}%` } },
            { contract_title_indo: { [Op.like]: `%${search}%` } },
            { contract_title_mandarin: { [Op.like]: `%${search}%` } },
          ],
        };
      }
      if (id_company) obj.id_company = id_company;
      if (id_customer) obj.id_customer = id_customer;
      if (status) obj.status = status;
      if (contract_type) obj.contract_type = contract_type;

      const contracts = await contractService.getAllWithRelations(
        { where: obj },
        isDoubleDatabase,
      );

      return successResponse(
        res,
        contracts,
        "Contracts retrieved successfully",
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

  /**
   * Create contract with services, clauses, clause points, and clause logs
   */
  async create(req, res) {
    try {
      const { is_double_database, services, clauses, ...contractData } =
        req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Validation
      if (!contractData.id_company) {
        return errorResponse(res, "id_company is required", 400);
      }

      if (!contractData.id_customer) {
        return errorResponse(res, "id_customer is required", 400);
      }

      if (!contractData.contract_no) {
        return errorResponse(res, "contract_no is required", 400);
      }

      if (!contractData.contract_title_indo) {
        return errorResponse(res, "contract_title_indo is required", 400);
      }

      if (!contractData.contract_title_mandarin) {
        return errorResponse(res, "contract_title_mandarin is required", 400);
      }

      if (!contractData.contract_type) {
        return errorResponse(res, "contract_type is required", 400);
      }

      if (!contractData.date) {
        return errorResponse(res, "date is required", 400);
      }

      // Validate services
      if (services && !Array.isArray(services)) {
        return errorResponse(res, "services must be an array", 400);
      }

      // Validate clauses
      if (clauses && !Array.isArray(clauses)) {
        return errorResponse(res, "clauses must be an array", 400);
      }

      // Validate each clause structure
      if (clauses && clauses.length > 0) {
        for (let i = 0; i < clauses.length; i++) {
          const clause = clauses[i];

          if (!clause.description_indo) {
            return errorResponse(
              res,
              `description_indo is required for clause at index ${i}`,
              400,
            );
          }

          if (!clause.description_mandarin) {
            return errorResponse(
              res,
              `description_mandarin is required for clause at index ${i}`,
              400,
            );
          }

          if (clause.clause_point && !Array.isArray(clause.clause_point)) {
            return errorResponse(
              res,
              `clause_point must be an array for clause at index ${i}`,
              400,
            );
          }

          if (clause.clause_logs && !Array.isArray(clause.clause_logs)) {
            return errorResponse(
              res,
              `clause_logs must be an array for clause at index ${i}`,
              400,
            );
          }

          // Validate clause_point and their nested clause_logs
          if (clause.clause_point && clause.clause_point.length > 0) {
            for (let j = 0; j < clause.clause_point.length; j++) {
              const point = clause.clause_point[j];

              if (point.clause_logs && !Array.isArray(point.clause_logs)) {
                return errorResponse(
                  res,
                  `clause_logs must be an array for clause_point at clause index ${i}, point index ${j}`,
                  400,
                );
              }
            }
          }
        }
      }

      // Set default values
      const contractDataToCreate = {
        ...contractData,
        status: "pending",
        note: contractData.note || "",
        is_active:
          contractData.is_active !== undefined ? contractData.is_active : true,
      };

      const result = await contractService.createWithRelations(
        contractDataToCreate,
        services || [],
        clauses || [],
        isDoubleDatabase,
      );

      return successResponse(res, result, "Contract created successfully", 201);
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update contract with services, clauses, clause points, and clause logs
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, services, clauses, ...contractData } =
        req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if contract exists
      const existing = await contractService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Contract not found", 404);
      }

      // Validate services
      if (services && !Array.isArray(services)) {
        return errorResponse(res, "services must be an array", 400);
      }

      // Validate clauses
      if (clauses && !Array.isArray(clauses)) {
        return errorResponse(res, "clauses must be an array", 400);
      }

      // Validate each clause structure
      if (clauses && clauses.length > 0) {
        for (let i = 0; i < clauses.length; i++) {
          const clause = clauses[i];

          if (clause.clause_point && !Array.isArray(clause.clause_point)) {
            return errorResponse(
              res,
              `clause_point must be an array for clause at index ${i}`,
              400,
            );
          }

          if (clause.clause_logs && !Array.isArray(clause.clause_logs)) {
            return errorResponse(
              res,
              `clause_logs must be an array for clause at index ${i}`,
              400,
            );
          }

          // Validate clause_point and their nested clause_logs
          if (clause.clause_point && clause.clause_point.length > 0) {
            for (let j = 0; j < clause.clause_point.length; j++) {
              const point = clause.clause_point[j];

              if (point.clause_logs && !Array.isArray(point.clause_logs)) {
                return errorResponse(
                  res,
                  `clause_logs must be an array for clause_point at clause index ${i}, point index ${j}`,
                  400,
                );
              }
            }
          }
        }
      }

      const result = await contractService.updateWithRelations(
        id,
        contractData,
        services || [],
        clauses || [],
        isDoubleDatabase,
      );

      return successResponse(res, result, "Contract updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Submit contract for verification
   */
  async submit(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, note } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if contract exists
      const existing = await contractService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Contract not found", 404);
      }

      const result = await contractService.submitContract(
        id,
        note,
        isDoubleDatabase,
      );

      return successResponse(res, result, "Contract submitted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Approve contract
   */
  async approve(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, note } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if contract exists
      const existing = await contractService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Contract not found", 404);
      }

      const result = await contractService.approveContract(
        id,
        note,
        isDoubleDatabase,
      );

      return successResponse(res, result, "Contract approved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Reject contract
   */
  async reject(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, note } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if contract exists
      const existing = await contractService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Contract not found", 404);
      }

      if (!note) {
        return errorResponse(res, "Rejection note is required", 400);
      }

      const result = await contractService.rejectContract(
        id,
        note,
        isDoubleDatabase,
      );

      return successResponse(res, result, "Contract rejected successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Send contract to customer
   */
  async sendToCustomer(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, note } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if contract exists
      const existing = await contractService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Contract not found", 404);
      }

      const result = await contractService.sendToCustomer(
        id,
        note,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        result,
        "Contract sent to customer successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Customer approves contract
   */
  async approveByCustomer(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, note } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if contract exists
      const existing = await contractService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Contract not found", 404);
      }

      const result = await contractService.approveByCustomer(
        id,
        note,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        result,
        "Contract approved by customer successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Customer rejects contract
   */
  async rejectByCustomer(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, note } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if contract exists
      const existing = await contractService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Contract not found", 404);
      }

      if (!note) {
        return errorResponse(res, "Rejection note is required", 400);
      }

      const result = await contractService.rejectByCustomer(
        id,
        note,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        result,
        "Contract rejected by customer successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Open Payment
   */
  async openPayment(req, res) {
    try {
      const { id_payment } = req.params;
      const { is_double_database = true } = req.body || {};
      const isDoubleDatabase = is_double_database;

      // Check if contract exists
      const existing = await paymentService.findById(
        id_payment,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Payment not found", 404);
      }

      const result = await paymentService.update(
        id_payment,
        { is_open: true },
        isDoubleDatabase,
      );

      return successResponse(res, result, "Payment opened successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete contract
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      // Check if contract exists
      const existing = await contractService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Contract not found", 404);
      }

      await contractService.delete(id, isDoubleDatabase);

      return successResponse(res, null, "Contract deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new ContractController();
