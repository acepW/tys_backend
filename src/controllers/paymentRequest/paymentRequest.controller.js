const paymentRequestService = require("../../services/paymentRequest/paymentRequest.service");
const { successResponse, errorResponse } = require("../../utils/response");
const { Op } = require("sequelize");

class PaymentRequestController {
  /**
   * Get all payment requests
   */
  async getAll(req, res) {
    try {
      const {
        is_double_database,
        id_contract,
        id_contract_service,
        id_contract_project_plan,
        status,
        cost_bearer,
        search,
        page,
        limit,
      } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      let obj = {};
      if (search) {
        obj = {
          [Op.or]: [
            { payment_request_no: { [Op.like]: `%${search}%` } },
            { vendor_name: { [Op.like]: `%${search}%` } },
            { invoice_no: { [Op.like]: `%${search}%` } },
          ],
        };
      }
      if (id_contract) obj.id_contract = id_contract;
      if (id_contract_service) obj.id_contract_service = id_contract_service;
      if (id_contract_project_plan)
        obj.id_contract_project_plan = id_contract_project_plan;
      if (status) obj.status = status;
      if (cost_bearer) obj.cost_bearer = cost_bearer;

      const paymentRequests = await paymentRequestService.getAllWithRelations(
        { where: obj },
        parseInt(page),
        parseInt(limit),
        isDoubleDatabase
      );

      return successResponse(
        res,
        paymentRequests,
        "Payment requests retrieved successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get payment request by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const paymentRequest = await paymentRequestService.getById(
        id,
        {},
        isDoubleDatabase
      );

      if (!paymentRequest) {
        return errorResponse(res, "Payment request not found", 404);
      }

      return successResponse(
        res,
        paymentRequest,
        "Payment request retrieved successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create payment request
   * Status awal: pending (payment request) & requested (verification progress)
   * Fields yang tidak diisi saat create: total_payment, file_proof_payment
   */
  async create(req, res) {
    try {
      const { is_double_database, ...paymentRequestData } = req.body;
      const isDoubleDatabase = is_double_database !== false;
      console.log(req.body);
      if (!paymentRequestData.payment_request_no) {
        return errorResponse(res, "payment_request_no is required", 400);
      }

      if (!paymentRequestData.payment_type) {
        return errorResponse(res, "payment_type is required", 400);
      }

      if (!paymentRequestData.vendor_name) {
        return errorResponse(res, "vendor_name is required", 400);
      }

      if (!paymentRequestData.invoice_no) {
        return errorResponse(res, "invoice_no is required", 400);
      }

      if (!paymentRequestData.payment_date) {
        return errorResponse(res, "payment_date is required", 400);
      }

      if (
        paymentRequestData.total_payment_request === undefined ||
        paymentRequestData.total_payment_request === null
      ) {
        return errorResponse(res, "total_payment_request is required", 400);
      }

      if (!paymentRequestData.description) {
        return errorResponse(res, "description is required", 400);
      }

      // Build data to create — exclude fields that should not be set on create
      const dataToCreate = {
        ...paymentRequestData,
        id_user_request: req.user.id,
        id_department_request: req.user.id_department,
        status: "pending",
        is_active:
          paymentRequestData.is_active !== undefined
            ? paymentRequestData.is_active
            : true,
        // Explicitly exclude: total_payment, file_proof_payment
        total_payment: null,
        file_proof_payment: null,
      };

      const result = await paymentRequestService.createWithRelations(
        dataToCreate,
        req.user.id,
        isDoubleDatabase
      );

      return successResponse(
        res,
        result,
        "Payment request created successfully",
        201
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Approve payment request
   * Wajib mengisi cost_bearer (customer/company)
   * - cost_bearer = "customer" → status payment request = "continue_to_debit_note"
   * - cost_bearer = "company"  → status payment request = "approved"
   * Verification progress status = "approved" untuk kedua kondisi
   */
  async approve(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true, note, role } = req.body || {};
      const isDoubleDatabase = is_double_database;

      // Check if payment request exists
      const existing = await paymentRequestService.findById(
        id,
        {},
        isDoubleDatabase
      );
      if (!existing) {
        return errorResponse(res, "Payment request not found", 404);
      }

      // Validate payer
      // if (!payer) {
      //   return errorResponse(res, "payer is required", 400);
      // }

      // if (!["customer", "company"].includes(payer)) {
      //   return errorResponse(
      //     res,
      //     "payer must be either 'customer' or 'company'",
      //     400,
      //   );
      // }

      // Whitelist role yang valid
      const VALID_ROLES = ["spv", "fat", "spv fat", "manager fat", "director"];
      if (!VALID_ROLES.includes(role)) {
        return errorResponse(
          res,
          `Invalid role "${role}". Valid roles: ${VALID_ROLES.join(", ")}`,
          400
        );
      }

      const result = await paymentRequestService.approvePaymentRequest(
        role,
        id,
        note,
        req.user.id,
        existing.cost_bearer,
        isDoubleDatabase
      );

      return successResponse(
        res,
        result,
        "Payment request approved successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Reject payment request
   * Note wajib diisi
   */
  async reject(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true, note, role } = req.body || {};
      const isDoubleDatabase = is_double_database;

      // Check if payment request exists
      const existing = await paymentRequestService.findById(
        id,
        {},
        isDoubleDatabase
      );
      if (!existing) {
        return errorResponse(res, "Payment request not found", 404);
      }

      if (!note) {
        return errorResponse(res, "Rejection note is required", 400);
      }

      const VALID_ROLES = ["spv", "fat", "spv fat", "manager fat", "director"];
      if (!VALID_ROLES.includes(role)) {
        return errorResponse(
          res,
          `Invalid role "${role}". Valid roles: ${VALID_ROLES.join(", ")}`,
          400
        );
      }

      const result = await paymentRequestService.rejectPaymentRequest(
        role,
        id,
        note,
        req.user.id,
        isDoubleDatabase
      );

      return successResponse(
        res,
        result,
        "Payment request rejected successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Mark payment request as paid
   * Wajib mengisi: total_payment dan file_proof_payment
   */
  async paid(req, res) {
    try {
      const { id } = req.params;
      const {
        is_double_database = true,
        note,
        total_payment,
        file_proof_payment,
      } = req.body || {};
      const isDoubleDatabase = is_double_database;

      // Check if payment request exists
      const existing = await paymentRequestService.findById(
        id,
        {},
        isDoubleDatabase
      );
      if (!existing) {
        return errorResponse(res, "Payment request not found", 404);
      }

      // Validate required fields for paid
      if (total_payment === undefined || total_payment === null) {
        return errorResponse(res, "total_payment is required", 400);
      }

      if (!file_proof_payment) {
        return errorResponse(res, "file_proof_payment is required", 400);
      }

      const result = await paymentRequestService.paidPaymentRequest(
        id,
        total_payment,
        file_proof_payment,
        note,
        req.user.id,
        isDoubleDatabase
      );

      return successResponse(
        res,
        result,
        "Payment request marked as paid successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete payment request
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      // Check if payment request exists
      const existing = await paymentRequestService.findById(
        id,
        {},
        isDoubleDatabase
      );
      if (!existing) {
        return errorResponse(res, "Payment request not found", 404);
      }

      await paymentRequestService.delete(id, isDoubleDatabase);

      return successResponse(res, null, "Payment request deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new PaymentRequestController();
