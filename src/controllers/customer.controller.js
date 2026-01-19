const customerService = require("../services/customer.service");
const { successResponse, errorResponse } = require("../utils/response");

class CustomerController {
  /**
   * Get all customers
   */
  async getAll(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      const customers = await customerService.findAll({}, isDoubleDatabase);

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
   * Get customer by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      const customer = await customerService.findById(id, {}, isDoubleDatabase);

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
   * Create new customer
   */
  async create(req, res) {
    try {
      const isDoubleDatabase = req.body.is_double_database !== false;

      // Validation
      if (!req.body.company_name) {
        return errorResponse(res, "Company name is required", 400);
      }

      // Check if email already exists
      if (req.body.email) {
        const emailExists = await customerService.checkEmailExists(
          req.body.email,
          null,
          isDoubleDatabase,
        );

        if (emailExists) {
          return errorResponse(res, "Email already exists", 400);
        }
      }

      const data = {
        company_name: req.body.company_name,
        address: req.body.address,
        contact: req.body.contact,
        email: req.body.email,
        pic_name: req.body.pic_name,
        is_active: req.body.is_active !== undefined ? req.body.is_active : true,
      };

      const customer = await customerService.create(data, isDoubleDatabase);

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
   * Update customer
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.body.is_double_database !== false;

      // Check if customer exists
      const existing = await customerService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Customer not found", 404);
      }

      // Check if email already exists
      if (req.body.email) {
        const emailExists = await customerService.checkEmailExists(
          req.body.email,
          id,
          isDoubleDatabase,
        );

        if (emailExists) {
          return errorResponse(res, "Email already exists", 400);
        }
      }

      const data = {};
      if (req.body.company_name) data.company_name = req.body.company_name;
      if (req.body.address !== undefined) data.address = req.body.address;
      if (req.body.contact !== undefined) data.contact = req.body.contact;
      if (req.body.email !== undefined) data.email = req.body.email;
      if (req.body.pic_name !== undefined) data.pic_name = req.body.pic_name;
      if (req.body.is_active !== undefined) data.is_active = req.body.is_active;

      const customer = await customerService.update(id, data, isDoubleDatabase);

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

      // Check if customer exists
      const existing = await customerService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Customer not found", 404);
      }

      await customerService.delete(id, isDoubleDatabase);

      return successResponse(res, null, "Customer deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new CustomerController();
