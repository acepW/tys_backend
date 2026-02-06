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
      const {
        company_name,
        address,
        contact,
        email,
        tax,
        initial_company,
        director_name,
        main_note,
        document_watermark,
        logo_header,
        company_name_header_quotation,
        address_header_quotation,
        wechat_header_quotation,
        wa_header_quotation,
        email_header_quotation,
        company_name_header_contract,
        address_header_contract,
        wechat_header_contract,
        wa_header_contract,
        email_header_contract,
        is_active,
        is_double_database,
      } = req.body;
      const isDoubleDatabase = is_double_database !== false;

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
        company_name: company_name,
        address: address,
        contact: contact,
        email: email,
        tax: tax !== undefined ? tax : false,
        initial_company: initial_company,
        director_name: director_name,
        main_note: main_note,
        document_watermark: document_watermark,
        logo_header: logo_header,
        company_name_header_quotation: company_name_header_quotation,
        address_header_quotation: address_header_quotation,
        wechat_header_quotation: wechat_header_quotation,
        wa_header_quotation: wa_header_quotation,
        email_header_quotation: email_header_quotation,
        company_name_header_contract: company_name_header_contract,
        address_header_contract: address_header_contract,
        wechat_header_contract: wechat_header_contract,
        wa_header_contract: wa_header_contract,
        email_header_contract: email_header_contract,
        is_active: is_active !== undefined ? is_active : true,
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
      const {
        company_name,
        address,
        contact,
        email,
        tax,
        initial_company,
        director_name,
        main_note,
        document_watermark,
        logo_header,
        company_name_header_quotation,
        address_header_quotation,
        wechat_header_quotation,
        wa_header_quotation,
        email_header_quotation,
        company_name_header_contract,
        address_header_contract,
        wechat_header_contract,
        wa_header_contract,
        email_header_contract,
        is_active,
        is_double_database,
      } = req.body;
      const isDoubleDatabase = is_double_database !== false;

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
      if (company_name) data.company_name = company_name;
      if (address !== undefined) data.address = address;
      if (contact !== undefined) data.contact = contact;
      if (email !== undefined) data.email = email;
      if (tax !== undefined) data.tax = tax;
      if (initial_company !== undefined) data.initial_company = initial_company;
      if (director_name !== undefined) data.director_name = director_name;
      if (main_note !== undefined) data.main_note = main_note;
      if (document_watermark !== undefined)
        data.document_watermark = document_watermark;
      if (logo_header !== undefined) data.logo_header = logo_header;
      if (company_name_header_quotation !== undefined)
        data.company_name_header_quotation = company_name_header_quotation;
      if (address_header_quotation !== undefined)
        data.address_header_quotation = address_header_quotation;
      if (wechat_header_quotation !== undefined)
        data.wechat_header_quotation = wechat_header_quotation;
      if (wa_header_quotation !== undefined)
        data.wa_header_quotation = wa_header_quotation;
      if (email_header_quotation !== undefined)
        data.email_header_quotation = email_header_quotation;
      if (company_name_header_contract !== undefined)
        data.company_name_header_contract = company_name_header_contract;
      if (address_header_contract !== undefined)
        data.address_header_contract = address_header_contract;
      if (wechat_header_contract !== undefined)
        data.wechat_header_contract = wechat_header_contract;
      if (wa_header_contract !== undefined)
        data.wa_header_contract = wa_header_contract;
      if (email_header_contract !== undefined)
        data.email_header_contract = email_header_contract;
      if (is_active !== undefined) data.is_active = is_active;

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
