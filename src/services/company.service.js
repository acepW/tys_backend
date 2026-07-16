const { Op, where } = require("sequelize");
const DualDatabaseService = require("./dualDatabase.service");
const { models, db1, db2 } = require("../models");
const fileService = require("./file.service");

class CompanyService extends DualDatabaseService {
  constructor() {
    super("Company");
  }

  /**
   * Get active companies
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Active companies
   */
  async getActiveCompanies(isDoubleDatabase = true) {
    const options = {
      where: { is_active: true },
      order: [["company_name", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Get all vendors with relations
   */
  async getAllWithRelations(
    options = {},
    page = null,
    limit = null,
    isDoubleDatabase = true
  ) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.File,
          as: "files",
          required: false,
          where: { is_active: true },
        },
      ],
      order: [["createdAt", "DESC"]],
    };

    if (!page || !limit) {
      return await this.findAll(queryOptions, isDoubleDatabase);
    }

    const offset = (page - 1) * limit;
    const { count, rows } = await this.findAndCountAll(
      { ...queryOptions, limit, offset },
      isDoubleDatabase
    );

    return {
      data: rows,
      pagination: {
        total_data: count,
        total_page: Math.ceil(count / limit),
        current_page: page,
        per_page: limit,
      },
    };
  }

  /**
   * Get vendor by ID with relations
   */
  async getById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.File,
          as: "files",
          where: { is_active: true },
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Search companies by name
   * @param {String} searchTerm
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Matching companies
   */
  async searchByName(searchTerm, isDoubleDatabase = true) {
    const options = {
      where: {
        company_name: {
          [Op.like]: `%${searchTerm}%`,
        },
      },
      order: [["company_name", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Check if email already exists
   * @param {String} email
   * @param {Number|null} excludeId
   * @param {Boolean} isDoubleDatabase
   * @returns {Boolean}
   */
  async checkEmailExists(email, excludeId = null, isDoubleDatabase = true) {
    const where = { email };

    if (excludeId) {
      where.id = { [Op.ne]: excludeId };
    }

    const existing = await this.findOne({ where }, isDoubleDatabase);
    return existing !== null;
  }

  /**
   * Build company payload from raw request body.
   * @param {Object} body
   * @param {Boolean} isUpdate - if true, only include fields that are explicitly provided
   */
  _buildCompanyData(body, isUpdate = false) {
    const fields = [
      "company_name",
      "address",
      "contact",
      "email",
      "tax_ppn",
      "tax_pph_23",
      "initial_company",
      "director_name",
      "main_note",
      "document_watermark",
      "logo_header",
      "company_name_header_quotation",
      "address_header_quotation",
      "wechat_header_quotation",
      "wa_header_quotation",
      "email_header_quotation",
      "company_name_header_contract",
      "address_header_contract",
      "wechat_header_contract",
      "wa_header_contract",
      "email_header_contract",
      "company_name_header_invoice",
      "address_header_invoice",
      "wechat_header_invoice",
      "wa_header_invoice",
      "email_header_invoice",
      "bank_name_rmb",
      "bank_name_rmb_mandarin",
      "account_name_rmb",
      "account_no_rmb",
      "swift_no_rmb",
      "bank_name_idr",
      "bank_name_idr_mandarin",
      "account_name_idr",
      "account_no_idr",
      "swift_no_idr",
      "is_active",
    ];

    const data = {};

    if (isUpdate) {
      for (const field of fields) {
        if (body[field] !== undefined) {
          data[field] = body[field];
        }
      }
      // company_name only updated if truthy (matches previous controller behavior)
      if (!body.company_name) {
        delete data.company_name;
      }
    } else {
      for (const field of fields) {
        data[field] = body[field];
      }
      data.tax_ppn = body.tax_ppn !== undefined ? body.tax_ppn : false;
      data.tax_pph_23 = body.tax_pph_23 !== undefined ? body.tax_pph_23 : false;
      data.is_active = body.is_active !== undefined ? body.is_active : true;
    }

    return data;
  }

  /**
   * Create company (with validation), wrapped in a transaction so
   * future related-table inserts (e.g. company settings, branches) stay atomic.
   * @param {Object} body - raw request body
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} created company
   */
  async createWithRelations(body, id_create, isDoubleDatabase = true) {
    // Validation (outside transaction, cheap early exit)
    if (!body.company_name) {
      throw new Error("Company name is required");
    }

    if (body.email) {
      const emailExists = await this.checkEmailExists(
        body.email,
        null,
        isDoubleDatabase
      );
      if (emailExists) {
        throw new Error("Email already exists");
      }
    }

    const dataToCreate = this._buildCompanyData(body, false);

    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Creating Company with relations in both databases...`);

        // 1. Create Company in DB1
        const company1 = await this.Model1.create(dataToCreate, {
          transaction: transaction1,
        });
        console.log(`✅ Created Company in DB1 with ID: ${company1.id}`);

        // 2. Create Company in DB2 with same ID
        await this.Model2.create(
          { ...dataToCreate, id: company1.id },
          { transaction: transaction2 }
        );
        console.log(`✅ Created Company in DB2 with ID: ${company1.id}`);

        // 3. create update file
        await fileService.syncFiles(
          "companies",
          company1.id,
          body.files,
          { uploadedBy: id_create, hardDelete: false },
          transaction1,
          transaction2
        );

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Company with relations successfully created`);

        return company1.toJSON();
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const company = await this.Model1.create(dataToCreate, {
          transaction: transaction1,
        });

        // 3. create update file
        await fileService.syncFiles(
          "companies",
          company.id,
          body.files,
          { uploadedBy: id_create, hardDelete: false },
          transaction1,
          null
        );

        await transaction1.commit();
        console.log(`✅ Company created in DB1 only`);

        return company.toJSON();
      }
    } catch (error) {
      console.error(`❌ Error creating Company:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to create Company: ${error.message}`);
    }
  }

  /**
   * Update company (with validation) and related records in a transaction.
   * @param {Number|String} id
   * @param {Object} body - raw request body
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} updated company
   */
  async updateWithRelations(id, body, id_update, isDoubleDatabase = true) {
    const existing = await this.findById(id, {}, isDoubleDatabase);
    if (!existing) {
      throw new Error(`Company with ID ${id} not found`);
    }

    // if (body.email) {
    //   const emailExists = await this.checkEmailExists(
    //     body.email,
    //     id,
    //     isDoubleDatabase
    //   );
    //   if (emailExists) {
    //     throw new Error("Email already exists");
    //   }
    // }

    const dataToUpdate = this._buildCompanyData(body, true);

    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Updating Company ID ${id}...`);

        const [updatedRows1] = await this.Model1.update(dataToUpdate, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(dataToUpdate, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`Company with ID ${id} not found`);
        }

        console.log(`✅ Updated Company in both databases`);

        // 3. create update file
        await fileService.syncFiles(
          "companies",
          id,
          body.files,
          { uploadedBy: id_update, hardDelete: false },
          transaction1,
          transaction2
        );

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Company with relations successfully updated`);

        return await this.findById(id, {}, isDoubleDatabase);
      } else {
        transaction1 = await db1.transaction();

        const [updatedRows] = await this.Model1.update(dataToUpdate, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`Company with ID ${id} not found`);
        }

        // 3. create update file
        await fileService.syncFiles(
          "companies",
          id,
          body.files,
          { uploadedBy: id_update, hardDelete: false },
          transaction1,
          null
        );

        await transaction1.commit();
        console.log(`✅ Company updated in DB1 only`);

        return await this.findById(id, {}, isDoubleDatabase);
      }
    } catch (error) {
      console.error(`❌ Error updating Company:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to update Company: ${error.message}`);
    }
  }

  /**
   * Soft-delete (deactivate) a company.
   * @param {Number|String} id
   * @param {Boolean} isDoubleDatabase
   */
  async deleteCompany(id, isDoubleDatabase = true) {
    const existing = await this.findById(id, {}, isDoubleDatabase);
    if (!existing) {
      throw new Error(`Company with ID ${id} not found`);
    }

    return await this.update(id, { is_active: false }, isDoubleDatabase);
  }
}

module.exports = new CompanyService();
