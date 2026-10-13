const paymentRequestService = require("../../services/paymentRequest/paymentRequest.service");
const { successResponse, errorResponse } = require("../../utils/response");
const { Op } = require("sequelize");
const approvalAccess = require("../../services/approvalFlow/approvalAccess.service");
const { models } = require("../../models");

const EDITABLE_FIELDS = [
  "payment_request_no", "payment_type", "priority", "cost_bearer", "id_company",
  "payment_date", "total_payment_request", "description", "bank_name",
  "account_name", "account_number", "payment_purpose", "top_up_petty_cash",
  "vendor_name", "invoice_no", "billing_id", "payment_method", "id_vendor",
  "id_customer", "id_contract", "id_contract_service", "id_contract_project_plan",
  "id_contract_project_plan_cost", "sub_total_payment", "tax_ppn", "tax_pph_23",
  "tax_pp_20", "tax_pph_4_ayat_2", "ppn", "pph", "pp_20", "pph_4_ayat_2",
];

const PJT_TYPES = ["internal", "external"];

function editableData(body) {
  const data = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  return data;
}

// PJT-only fields. partial: only validate the fields that were sent (update).
// id_employee is optional (null/empty clears it); employee_name defaults to the
// employee's full_name when id_employee is set without it.
async function pjtData(body, partial = false) {
  const data = {};
  if (!partial || body.pjt_type !== undefined) {
    if (!PJT_TYPES.includes(body.pjt_type)) return { error: "pjt_type must be internal or external" };
    data.pjt_type = body.pjt_type;
  }
  if (body.employee_name !== undefined && body.employee_name !== null) {
    const name = String(body.employee_name).trim();
    if (name.length > 500) return { error: "employee_name must not exceed 500 characters" };
    data.employee_name = name || null;
  }
  if (body.id_employee === null || body.id_employee === "") {
    data.id_employee = null;
  } else if (body.id_employee !== undefined) {
    const idEmployee = Number(body.id_employee);
    if (!Number.isInteger(idEmployee) || idEmployee <= 0) return { error: "id_employee must be a positive integer" };
    const employee = await models.db1.Employee.findByPk(idEmployee, { attributes: ["id", "full_name"] });
    if (!employee) return { error: `Employee ${idEmployee} not found` };
    data.id_employee = idEmployee;
    if (!data.employee_name) data.employee_name = employee.full_name;
  }
  return { data };
}

function validateAmounts(body) {
  for (const field of [
    "total_payment_request", "sub_total_payment", "ppn", "pph", "pp_20",
    "pph_4_ayat_2", "top_up_petty_cash",
  ]) {
    if (body[field] !== undefined && body[field] !== null &&
        (body[field] === "" || !Number.isFinite(Number(body[field])) || Number(body[field]) < 0)) {
      return `${field} must be a non-negative number`;
    }
  }
  for (const field of ["tax_ppn", "tax_pph_23", "tax_pp_20", "tax_pph_4_ayat_2"]) {
    if (body[field] !== undefined && typeof body[field] !== "boolean") return `${field} must be a boolean`;
  }
  return null;
}

function validateExpenses(expenses) {
  if (!Array.isArray(expenses) || expenses.length === 0) return "expenses must be a non-empty array";
  for (let i = 0; i < expenses.length; i++) {
    const item = expenses[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) return `expenses[${i}] must be an object`;
    for (const field of ["purchase_date", "category", "description", "vendor", "total"]) {
      if (item[field] === undefined || item[field] === null || item[field] === "") return `expenses[${i}].${field} is required`;
    }
    if (!Number.isFinite(Number(item.total)) || Number(item.total) < 0) return `expenses[${i}].total must be a non-negative number`;
    if (item.files !== undefined && !Array.isArray(item.files)) return `expenses[${i}].files must be an array`;
  }
  return null;
}

function validateServices(services) {
  if (services === undefined) return null;
  if (!Array.isArray(services)) return "services must be an array";
  for (let i = 0; i < services.length; i++) {
    const item = services[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) return `services[${i}] must be an object`;
    for (const field of ["id_vendor", "id_vendor_service", "id_vendor_item", "id_category"]) {
      if (item[field] !== undefined && item[field] !== null &&
          (!Number.isInteger(Number(item[field])) || Number(item[field]) <= 0)) {
        return `services[${i}].${field} must be a positive integer`;
      }
    }
    if (item.id_vendor_service && item.id_vendor_item) {
      return `services[${i}] cannot have both id_vendor_service and id_vendor_item`;
    }
    if (!item.id_vendor_service && !item.id_vendor_item && !String(item.service_name ?? "").trim()) {
      return `services[${i}].service_name is required`;
    }
    for (const field of ["price_idr", "price_rmb"]) {
      if (item[field] !== undefined && item[field] !== null &&
          (item[field] === "" || !Number.isFinite(Number(item[field])) || Number(item[field]) < 0)) {
        return `services[${i}].${field} must be a non-negative number`;
      }
    }
  }
  return null;
}

class PaymentRequestController {
  async getNoPaymentRequest(req, res) {
    try {
      const isDoubleDatabase = req.query?.is_double_database !== "false";
      const numbers = await paymentRequestService.getNoPaymentRequest(isDoubleDatabase);
      return successResponse(res, numbers, "Payment request numbers retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

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
        payment_purpose,
        top_up_petty_cash,
        request_format,
        pjt_type,
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
            { payment_purpose: { [Op.like]: `%${search}%` } },
          ],
        };
      }
      if (id_contract) obj.id_contract = id_contract;
      if (id_contract_service) obj.id_contract_service = id_contract_service;
      if (id_contract_project_plan)
        obj.id_contract_project_plan = id_contract_project_plan;
      if (status) obj.status = status;
      if (cost_bearer) obj.cost_bearer = cost_bearer;
      if (payment_purpose) obj.payment_purpose = payment_purpose;
      if (top_up_petty_cash !== undefined) {
        obj.top_up_petty_cash = top_up_petty_cash;
      }
      if (request_format) obj.request_format = request_format;
      if (pjt_type) obj.pjt_type = pjt_type;
      obj.is_active = true;

      const paymentRequests = await paymentRequestService.getAllWithRelations(
        { where: obj },
        parseInt(page),
        parseInt(limit),
        req.user,
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
        await approvalAccess.attachActionFlags("payment request", paymentRequest, req.user?.id),
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
    return PaymentRequestController.prototype.createByFormat(req, res, "standard");
  }

  /**
   * Create PJT payment request: same body and rules as create, plus
   * pjt_type (internal/external), optional id_employee and employee_name
   * (defaults to the employee's full_name).
   */
  async createPjt(req, res) {
    return PaymentRequestController.prototype.createByFormat(req, res, "pjt");
  }

  async createByFormat(req, res, format) {
    try {
      const {
        is_double_database,
        files = [],
        services = [],
        ...paymentRequestData
      } = req.body;
      const isDoubleDatabase = is_double_database !== false;
      if (!Array.isArray(files)) {
        return errorResponse(res, "files must be an array", 400);
      }
      const serviceError = validateServices(services);
      if (serviceError) return errorResponse(res, serviceError, 400);
      if (!paymentRequestData.payment_request_no) {
        return errorResponse(res, "payment_request_no is required", 400);
      }

      if (!paymentRequestData.payment_type) {
        return errorResponse(res, "payment_type is required", 400);
      }

      if (
        paymentRequestData.top_up_petty_cash !== undefined &&
        (Number.isNaN(Number(paymentRequestData.top_up_petty_cash)) ||
          Number(paymentRequestData.top_up_petty_cash) < 0)
      ) {
        return errorResponse(
          res,
          "top_up_petty_cash must be a non-negative number",
          400,
        );
      }

      if (!paymentRequestData.vendor_name) {
        return errorResponse(res, "vendor_name is required", 400);
      }

      // PJT may not have an invoice yet.
      if (format !== "pjt" && !paymentRequestData.invoice_no) {
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
      const amountError = validateAmounts(paymentRequestData);
      if (amountError) return errorResponse(res, amountError, 400);
      let pjtFields = {};
      if (format === "pjt") {
        const pjt = await pjtData(paymentRequestData);
        if (pjt.error) return errorResponse(res, pjt.error, 400);
        pjtFields = pjt.data;
      }

      // Build data to create — exclude fields that should not be set on create
      const dataToCreate = {
        ...editableData(paymentRequestData),
        ...pjtFields,
        request_format: format,
        id_user_request: req.user.id,
        id_department_request: req.user.id_department,
        status: "pending",
        top_up_petty_cash: Number(paymentRequestData.top_up_petty_cash || 0),
        sub_total_payment: paymentRequestData.sub_total_payment ?? 0,
        tax_ppn: paymentRequestData.tax_ppn ?? false,
        tax_pph_23: paymentRequestData.tax_pph_23 ?? false,
        tax_pp_20: paymentRequestData.tax_pp_20 ?? false,
        tax_pph_4_ayat_2: paymentRequestData.tax_pph_4_ayat_2 ?? false,
        ppn: paymentRequestData.ppn ?? 0,
        pph: paymentRequestData.pph ?? 0,
        pp_20: paymentRequestData.pp_20 ?? 0,
        pph_4_ayat_2: paymentRequestData.pph_4_ayat_2 ?? 0,
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
        files,
        req.user.id,
        isDoubleDatabase,
        [],
        services,
      );

      return successResponse(
        res,
        result,
        format === "pjt" ? "PJT payment request created successfully" : "Payment request created successfully",
        201
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async createExpense(req, res) {
    try {
      const { is_double_database, files = [], expenses, services = [], ...body } = req.body || {};
      if (!Array.isArray(files)) return errorResponse(res, "files must be an array", 400);
      const expenseError = validateExpenses(expenses);
      if (expenseError) return errorResponse(res, expenseError, 400);
      const serviceError = validateServices(services);
      if (serviceError) return errorResponse(res, serviceError, 400);
      const data = editableData(body);
      data.total_payment_request = body.total_payment_request ?? body.total_payment;
      for (const field of [
        "payment_request_no", "payment_type", "priority", "cost_bearer", "id_company",
        "payment_date", "total_payment_request", "bank_name", "account_name",
        "account_number", "description",
      ]) {
        if (data[field] === undefined || data[field] === null || data[field] === "") return errorResponse(res, `${field} is required`, 400);
      }
      const amountError = validateAmounts(data);
      if (amountError) return errorResponse(res, amountError, 400);
      Object.assign(data, {
        request_format: "expense",
        id_user_request: req.user.id,
        id_department_request: req.user.id_department,
        status: "pending",
        top_up_petty_cash: 0,
        sub_total_payment: body.sub_total_payment ?? 0,
        tax_ppn: body.tax_ppn ?? false,
        tax_pph_23: body.tax_pph_23 ?? false,
        tax_pp_20: body.tax_pp_20 ?? false,
        tax_pph_4_ayat_2: body.tax_pph_4_ayat_2 ?? false,
        ppn: body.ppn ?? 0,
        pph: body.pph ?? 0,
        pp_20: body.pp_20 ?? 0,
        pph_4_ayat_2: body.pph_4_ayat_2 ?? 0,
        vendor_name: null,
        invoice_no: null,
      });
      const result = await paymentRequestService.createWithRelations(
        data, files, req.user.id, is_double_database !== false, expenses, services,
      );
      return successResponse(res, result, "Expense payment request created successfully", 201);
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 500);
    }
  }

  async update(req, res) {
    return PaymentRequestController.prototype.updateByFormat(req, res, "standard");
  }

  async updateExpense(req, res) {
    return PaymentRequestController.prototype.updateByFormat(req, res, "expense");
  }

  async updatePjt(req, res) {
    return PaymentRequestController.prototype.updateByFormat(req, res, "pjt");
  }

  async updateByFormat(req, res, format) {
    try {
      const { is_double_database, files, expenses, services, ...body } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;
      if (files !== undefined && !Array.isArray(files)) return errorResponse(res, "files must be an array", 400);
      const serviceError = validateServices(services);
      if (serviceError) return errorResponse(res, serviceError, 400);
      if (format !== "expense" && expenses !== undefined) return errorResponse(res, "expenses are only supported for expense payment requests", 400);
      if (format === "expense" && expenses !== undefined) {
        const expenseError = validateExpenses(expenses);
        if (expenseError) return errorResponse(res, expenseError, 400);
      }
      const existing = await paymentRequestService.findById(req.params.id, {}, true);
      if (!existing) return errorResponse(res, "Payment request not found", 404);
      if (existing.request_format !== format) return errorResponse(res, "Payment request format does not match endpoint", 400);
      const data = editableData(body);
      if (format === "expense" && body.total_payment !== undefined) data.total_payment_request = body.total_payment;
      if (format === "pjt") {
        const pjt = await pjtData(body, true);
        if (pjt.error) return errorResponse(res, pjt.error, 400);
        Object.assign(data, pjt.data);
      }
      const amountError = validateAmounts(data);
      if (amountError) return errorResponse(res, amountError, 400);
      const result = await paymentRequestService.updateWithRelations(
        req.params.id, data, files, expenses, req.user.id, isDoubleDatabase, services,
      );
      return successResponse(res, result, "Payment request updated successfully");
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 500);
    }
  }

  async updateFiles(req, res) {
    try {
      const { is_double_database = true, files } = req.body || {};
      if (!Array.isArray(files)) {
        return errorResponse(res, "files must be an array", 400);
      }

      const result = await paymentRequestService.updateFiles(
        req.params.id,
        files,
        req.user.id,
        is_double_database !== false,
      );
      return successResponse(
        res,
        result,
        "Payment request files updated successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 500);
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

      console.log(req.body);
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
      const VALID_ROLES = [
        "dept manager",
        "fat",
        "manager fat",
        "director",
        "cashier",
      ];
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

      const VALID_ROLES = [
        "dept manager",
        "fat",
        "manager fat",
        "director",
        "cashier",
      ];
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

      await paymentRequestService.update(
        id,
        { is_active: false },
        isDoubleDatabase
      );

      return successResponse(res, null, "Payment request deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new PaymentRequestController();
