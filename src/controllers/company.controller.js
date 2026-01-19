const companyService = require("../services/company.service");
const { successResponse, errorResponse } = require("../utils/response");

class CompanyController {
  /**
   * Get all companies
   */
  async getAll(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      const companies = await companyService.findAll({}, isDoubleDatabase);

      return successResponse(
        res,
        companies,
        "Companies retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get active companies
   */
  async getActive(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      const companies =
        await companyService.getActiveCompanies(isDoubleDatabase);

      return successResponse(
        res,
        companies,
        "Active companies retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get company by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      const company = await companyService.findById(id, {}, isDoubleDatabase);

      if (!company) {
        return errorResponse(res, "Company not found", 404);
      }

      return successResponse(res, company, "Company retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Search companies
   */
  async search(req, res) {
    try {
      const { query } = req.query;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      if (!query) {
        return errorResponse(res, "Search query is required", 400);
      }

      const companies = await companyService.searchByName(
        query,
        isDoubleDatabase,
      );

      return successResponse(res, companies, "Companies found successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create new company
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
        const emailExists = await companyService.checkEmailExists(
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
        currency: req.body.currency || "IDR",
        tax: req.body.tax !== undefined ? req.body.tax : false,
        is_active: req.body.is_active !== undefined ? req.body.is_active : true,
      };

      const company = await companyService.create(data, isDoubleDatabase);

      return successResponse(res, company, "Company created successfully", 201);
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update company
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.body.is_double_database !== false;

      // Check if company exists
      const existing = await companyService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Company not found", 404);
      }

      // Check if email already exists
      if (req.body.email) {
        const emailExists = await companyService.checkEmailExists(
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
      if (req.body.currency) data.currency = req.body.currency;
      if (req.body.tax !== undefined) data.tax = req.body.tax;
      if (req.body.is_active !== undefined) data.is_active = req.body.is_active;

      const company = await companyService.update(id, data, isDoubleDatabase);

      return successResponse(res, company, "Company updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete company
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      // Check if company exists
      const existing = await companyService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Company not found", 404);
      }

      await companyService.delete(id, isDoubleDatabase);

      return successResponse(res, null, "Company deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new CompanyController();
