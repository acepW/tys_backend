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
        "Customers retrieved successfully"
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
      const customers = await customerService.getActiveCustomers(
        isDoubleDatabase
      );

      return successResponse(
        res,
        customers,
        "Active customers retrieved successfully"
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
        isDoubleDatabase
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

      // Check if email already exists
      if (req.body.email_indo) {
        const emailExists = await customerService.checkEmailExists(
          req.body.email,
          null,
          isDoubleDatabase
        );

        if (emailExists) {
          return errorResponse(res, "Email already exists", 400);
        }
      }

      const data = {
        customer_type: req.body.customer_type,

        company_name_indo: req.body.company_name_indo,
        company_name_mandarin: req.body.company_name_mandarin,
        is_company_name_same:
          req.body.is_company_name_same !== undefined
            ? req.body.is_company_name_same
            : false,

        address_indo: req.body.address_indo,
        address_mandarin: req.body.address_mandarin,
        is_address_same:
          req.body.is_address_same !== undefined
            ? req.body.is_address_same
            : false,

        contact_indo: req.body.contact_indo,
        contact_mandarin: req.body.contact_mandarin,
        is_contact_same:
          req.body.is_contact_same !== undefined
            ? req.body.is_contact_same
            : false,

        email_indo: req.body.email_indo,
        email_mandarin: req.body.email_mandarin,
        is_email_same:
          req.body.is_email_same !== undefined ? req.body.is_email_same : false,

        pic_name_indo: req.body.pic_name_indo,
        pic_name_mandarin: req.body.pic_name_mandarin,
        is_pic_name_same:
          req.body.is_pic_name_same !== undefined
            ? req.body.is_pic_name_same
            : false,

        pic_position_indo: req.body.pic_position_indo,
        pic_position_mandarin: req.body.pic_position_mandarin,
        is_pic_position_same:
          req.body.is_pic_position_same !== undefined
            ? req.body.is_pic_position_same
            : false,

        director_name_indo: req.body.director_name_indo,
        director_name_mandarin: req.body.director_name_mandarin,
        is_director_name_same:
          req.body.is_director_name_same !== undefined
            ? req.body.is_director_name_same
            : false,

        director_position_indonesian: req.body.director_position_indonesian,
        director_position_mandarin: req.body.director_position_mandarin,
        is_director_position_same:
          req.body.is_director_position_same !== undefined
            ? req.body.is_director_position_same
            : false,
      };

      const customer = await customerService.create(data, isDoubleDatabase);

      return successResponse(
        res,
        customer,
        "Customer created successfully",
        201
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

      const data = {};
      if (req.body.customer_type !== undefined)
        data.customer_type = req.body.customer_type;

      if (req.body.company_name_indo !== undefined)
        data.company_name_indo = req.body.company_name_indo;

      if (req.body.company_name_mandarin !== undefined)
        data.company_name_mandarin = req.body.company_name_mandarin;

      if (req.body.is_company_name_same !== undefined)
        data.is_company_name_same = req.body.is_company_name_same;

      if (req.body.address_indo !== undefined)
        data.address_indo = req.body.address_indo;

      if (req.body.address_mandarin !== undefined)
        data.address_mandarin = req.body.address_mandarin;

      if (req.body.is_address_same !== undefined)
        data.is_address_same = req.body.is_address_same;

      if (req.body.contact_indo !== undefined)
        data.contact_indo = req.body.contact_indo;

      if (req.body.contact_mandarin !== undefined)
        data.contact_mandarin = req.body.contact_mandarin;

      if (req.body.is_contact_same !== undefined)
        data.is_contact_same = req.body.is_contact_same;

      if (req.body.email_indo !== undefined)
        data.email_indo = req.body.email_indo;

      if (req.body.email_mandarin !== undefined)
        data.email_mandarin = req.body.email_mandarin;

      if (req.body.is_email_same !== undefined)
        data.is_email_same = req.body.is_email_same;

      if (req.body.pic_name_indo !== undefined)
        data.pic_name_indo = req.body.pic_name_indo;

      if (req.body.pic_name_mandarin !== undefined)
        data.pic_name_mandarin = req.body.pic_name_mandarin;

      if (req.body.is_pic_name_same !== undefined)
        data.is_pic_name_same = req.body.is_pic_name_same;

      if (req.body.pic_position_indo !== undefined)
        data.pic_position_indo = req.body.pic_position_indo;

      if (req.body.pic_position_mandarin !== undefined)
        data.pic_position_mandarin = req.body.pic_position_mandarin;

      if (req.body.is_pic_position_same !== undefined)
        data.is_pic_position_same = req.body.is_pic_position_same;

      if (req.body.director_name_indo !== undefined)
        data.director_name_indo = req.body.director_name_indo;

      if (req.body.director_name_mandarin !== undefined)
        data.director_name_mandarin = req.body.director_name_mandarin;

      if (req.body.is_director_name_same !== undefined)
        data.is_director_name_same = req.body.is_director_name_same;

      if (req.body.director_position_indonesian !== undefined)
        data.director_position_indonesian =
          req.body.director_position_indonesian;

      if (req.body.director_position_mandarin !== undefined)
        data.director_position_mandarin = req.body.director_position_mandarin;

      if (req.body.is_director_position_same !== undefined)
        data.is_director_position_same = req.body.is_director_position_same;
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
