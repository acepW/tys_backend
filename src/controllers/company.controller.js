const companyService = require("../services/company.service");
const { successResponse, errorResponse } = require("../utils/response");

class CompanyController {
  /**
   * Get all companies
   */
  async getAll(req, res) {
    try {
      const { is_double_database = true } = req.query || {};
      const isDoubleDatabase = is_double_database;
      const companies = await companyService.getAllWithRelations(
        { where: { is_active: true } },
        null,
        null,
        isDoubleDatabase
      );

      return successResponse(
        res,
        companies,
        "Companies retrieved successfully"
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
      const companies = await companyService.getActiveCompanies(
        isDoubleDatabase
      );

      return successResponse(
        res,
        companies,
        "Active companies retrieved successfully"
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

      const company = await companyService.getById(id, {}, isDoubleDatabase);

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
        isDoubleDatabase
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
      const isDoubleDatabase = true;
      const company = await companyService.createWithRelations(
        req.body,
        req.user.id,
        isDoubleDatabase
      );

      return successResponse(res, company, "Company created successfully", 201);
    } catch (error) {
      const statusCode =
        error.message === "Company name is required" ||
        error.message === "Email already exists"
          ? 400
          : 500;
      return errorResponse(res, error.message, statusCode);
    }
  }

  /**
   * Update company
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = true;

      const company = await companyService.updateWithRelations(
        id,
        req.body,
        req.user.id,
        isDoubleDatabase
      );

      return successResponse(res, company, "Company updated successfully");
    } catch (error) {
      const statusCode = error.message.includes("not found")
        ? 404
        : error.message === "Email already exists"
        ? 400
        : 500;
      return errorResponse(res, error.message, statusCode);
    }
  }

  /**
   * Delete company
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      await companyService.deleteCompany(id, isDoubleDatabase);

      return successResponse(res, null, "Company deleted successfully");
    } catch (error) {
      const statusCode = error.message.includes("not found") ? 404 : 500;
      return errorResponse(res, error.message, statusCode);
    }
  }
}

module.exports = new CompanyController();
