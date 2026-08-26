const customerService = require("../services/customer.service");
const { successResponse, errorResponse } = require("../utils/response");

class CustomerController {
  /**
   * Get all customers (with relations: customer_documents)
   */
  async getAll(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      const page = req.query.page ? parseInt(req.query.page) : null;
      const limit = req.query.limit ? parseInt(req.query.limit) : null;

      const customers = await customerService.getAllWithRelations(
        { where: { is_active: true } },
        page,
        limit,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        customers,
        "Customers retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get active customers
   */
  async getActive(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      const customers =
        await customerService.getActiveCustomers(isDoubleDatabase);

      return successResponse(
        res,
        customers,
        "Active customers retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get customer by ID (with relations: customer_documents)
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      const customer = await customerService.getById(id, {}, isDoubleDatabase);

      if (!customer) {
        return errorResponse(res, "Customer not found", 404);
      }

      return successResponse(res, customer, "Customer retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Search customers
   */
  async search(req, res) {
    try {
      const { query } = req.query;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      if (!query) {
        return errorResponse(res, "Search query is required", 400);
      }

      const customers = await customerService.searchByCompanyName(
        query,
        isDoubleDatabase,
      );

      return successResponse(res, customers, "Customers found successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create new customer (+ customer_documents files)
   */
  async create(req, res) {
    try {
      const isDoubleDatabase = req.body.is_double_database !== false;

      const customer = await customerService.createWithRelations(
        req.body,
        req.user.id,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        customer,
        "Customer created successfully",
        201,
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update customer (+ customer_documents files)
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.body.is_double_database !== false;

      const customer = await customerService.updateWithRelations(
        id,
        req.body,
        req.user.id,
        isDoubleDatabase,
      );

      return successResponse(res, customer, "Customer updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete customer
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      const existing = await customerService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Customer not found", 404);
      }

      await customerService.deleteCustomer(id, isDoubleDatabase);

      return successResponse(res, null, "Customer deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new CustomerController();
