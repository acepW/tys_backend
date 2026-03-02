const DualDatabaseService = require("../dualDatabase.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");

class InvoiceService extends DualDatabaseService {
  constructor() {
    super("Invoice");
  }

  /**
   * Get all invoices with relations
   * @param {Object} options - Query options
   * @param {Number} page - Page number for pagination
   * @param {Number} limit - Number of records per page
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Invoices with relations
   */
  async getAllWithRelations(
    options = {},
    page = null,
    limit = null,
    isDoubleDatabase = true,
  ) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.Quotation,
          as: "quotation",
          attributes: [
            "quotation_no",
            "quotation_title_indo",
            "quotation_title_mandarin",
          ],
        },
        {
          model: dbModels.Contract,
          as: "contract",
          attributes: [
            "id",
            "contract_no",
            "contract_title_indo",
            "contract_title_mandarin",
          ],
        },
        {
          model: dbModels.ContractPayment,
          as: "contract_payment",
          attributes: [
            "id",
            "payment_time_indo",
            "payment_time_mandarin",
            "total_payment_idr",
            "total_payment_rmb",
          ],
        },
        {
          model: dbModels.Company,
          as: "company",
          attributes: ["id", "company_name"],
        },
        {
          model: dbModels.Customer,
          as: "customer",
          attributes: ["id", "company_name"],
        },
        {
          model: dbModels.User,
          as: "user_create",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_approve",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_reject",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.InvoiceService,
          as: "invoice_services",
          separate: true,
          include: [
            {
              model: dbModels.QuotationService,
              as: "quotation_service",
            },
          ],
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
      isDoubleDatabase,
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
   * Get invoice by ID with relations
   * @param {Number} id
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Invoice with relations
   */
  async getById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.Quotation,
          as: "quotation",
        },
        {
          model: dbModels.Contract,
          as: "contract",
        },
        {
          model: dbModels.ContractPayment,
          as: "contract_payment",
        },
        {
          model: dbModels.Company,
          as: "company",
        },
        {
          model: dbModels.Customer,
          as: "customer",
        },
        {
          model: dbModels.User,
          as: "user_create",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_approve",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_reject",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.InvoiceService,
          as: "invoice_services",
          include: [
            {
              model: dbModels.QuotationService,
              as: "quotation_service",
            },
          ],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Create invoice with invoice services
   * @param {Object} invoiceData - Invoice data
   * @param {Array} invoiceServices - Invoice services data
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Created invoice with all relations
   */
  async createWithRelations(
    invoiceData,
    invoiceServices = [],
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Creating Invoice with services in both databases...`);

        // 1. Create Invoice in DB1
        const invoice1 = await this.Model1.create(invoiceData, {
          transaction: transaction1,
        });
        console.log(`✅ Created Invoice in DB1 with ID: ${invoice1.id}`);

        // 2. Create Invoice in DB2 with same ID
        const invoiceDataWithId = { ...invoiceData, id: invoice1.id };
        await this.Model2.create(invoiceDataWithId, {
          transaction: transaction2,
        });
        console.log(`✅ Created Invoice in DB2 with ID: ${invoice1.id}`);

        // 3. Sync Invoice Services
        const servicesData = invoiceServices.map((service) => ({
          ...service,
          id_invoice: invoice1.id,
        }));

        const servicesResult = await syncChildRecords({
          Model1: models.db1.InvoiceService,
          Model2: models.db2.InvoiceService,
          foreignKey: "id_invoice",
          parentId: invoice1.id,
          newData: servicesData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        console.log(
          `✅ Synced ${servicesResult.created?.length || 0} Invoice Services`,
        );

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Invoice with all relations successfully created`);

        return {
          invoice: invoice1.toJSON(),
          invoice_services: servicesResult,
        };
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const invoice = await this.Model1.create(invoiceData, {
          transaction: transaction1,
        });

        const servicesData = invoiceServices.map((service) => ({
          ...service,
          id_invoice: invoice.id,
        }));

        const servicesResult = await syncChildRecords({
          Model1: models.db1.InvoiceService,
          Model2: null,
          foreignKey: "id_invoice",
          parentId: invoice.id,
          newData: servicesData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        await transaction1.commit();
        console.log(`✅ Invoice created in DB1 only`);

        return {
          invoice: invoice.toJSON(),
          invoice_services: servicesResult,
        };
      }
    } catch (error) {
      console.error(`❌ Error creating Invoice:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to create Invoice: ${error.message}`);
    }
  }

  /**
   * Update invoice with invoice services (create/update/delete)
   * @param {Number} id - Invoice ID
   * @param {Object} invoiceData - Invoice data to update
   * @param {Array} invoiceServices - Invoice services data
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated invoice with all relations
   */
  async updateWithRelations(
    id,
    invoiceData,
    invoiceServices = [],
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Updating Invoice ID ${id} with services...`);

        // 1. Update Invoice in both databases
        const [updatedRows1] = await this.Model1.update(invoiceData, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(invoiceData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`Invoice with ID ${id} not found`);
        }

        console.log(`✅ Updated Invoice in both databases`);

        // 2. Sync Invoice Services (syncChildRecords handles create/update/delete)
        const servicesData = invoiceServices.map((service) => ({
          ...service,
          id_invoice: id,
        }));

        const servicesResult = await syncChildRecords({
          Model1: models.db1.InvoiceService,
          Model2: models.db2.InvoiceService,
          foreignKey: "id_invoice",
          parentId: id,
          newData: servicesData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        console.log(`✅ Synced Invoice Services`);

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Invoice with all relations successfully updated`);

        return await this.getById(id, {}, isDoubleDatabase);
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const [updatedRows] = await this.Model1.update(invoiceData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`Invoice with ID ${id} not found`);
        }

        const servicesData = invoiceServices.map((service) => ({
          ...service,
          id_invoice: id,
        }));

        const servicesResult = await syncChildRecords({
          Model1: models.db1.InvoiceService,
          Model2: null,
          foreignKey: "id_invoice",
          parentId: id,
          newData: servicesData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        await transaction1.commit();
        console.log(`✅ Invoice updated in DB1 only`);

        return await this.getById(id, {}, isDoubleDatabase);
      }
    } catch (error) {
      console.error(`❌ Error updating Invoice:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to update Invoice: ${error.message}`);
    }
  }

  /**
   * Approve invoice
   * @param {Number} id - Invoice ID
   * @param {Number} id_user - User ID who approves
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated invoice
   */
  async approveInvoice(id, id_user, isDoubleDatabase = true) {
    return await this._changeStatus(
      id,
      { status: "approved", id_user_approve: id_user },
      isDoubleDatabase,
    );
  }

  /**
   * Reject invoice
   * @param {Number} id - Invoice ID
   * @param {Number} id_user - User ID who rejects
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated invoice
   */
  async rejectInvoice(id, id_user, note_reject, isDoubleDatabase = true) {
    return await this._changeStatus(
      id,
      { status: "rejected", id_user_reject: id_user, note_reject },
      isDoubleDatabase,
    );
  }

  /**
   * Internal method to change invoice status
   */
  async _changeStatus(id, updateData, isDoubleDatabase = true) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        await this.Model1.update(updateData, {
          where: { id },
          transaction: transaction1,
        });

        await this.Model2.update(updateData, {
          where: { id },
          transaction: transaction2,
        });

        await transaction1.commit();
        await transaction2.commit();
      } else {
        transaction1 = await db1.transaction();

        await this.Model1.update(updateData, {
          where: { id },
          transaction: transaction1,
        });

        await transaction1.commit();
      }

      return await this.getById(id, {}, isDoubleDatabase);
    } catch (error) {
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to change Invoice status: ${error.message}`);
    }
  }
}

module.exports = new InvoiceService();
