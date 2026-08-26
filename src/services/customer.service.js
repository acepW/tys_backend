const { Op } = require("sequelize");
const DualDatabaseService = require("./dualDatabase.service");
const { models, db1, db2 } = require("../models");
const fileService = require("./file.service");

class CustomerService extends DualDatabaseService {
  constructor() {
    super("Customer");
  }

  /**
   * Get active customers
   */
  async getActiveCustomers(isDoubleDatabase = true) {
    const options = {
      where: { is_active: true },
      order: [["company_name_indo", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Get all customers with relations (files)
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
          model: dbModels.File,
          as: "customer_documents",
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
   * Get customer by ID with relations (files)
   */
  async getById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.File,
          as: "customer_documents",
          required: false,
          where: { is_active: true },
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Search customers by company name (indo)
   */
  async searchByCompanyName(searchTerm, isDoubleDatabase = true) {
    const options = {
      where: {
        company_name_indo: {
          [Op.like]: `%${searchTerm}%`,
        },
      },
      order: [["company_name_indo", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Check if email already exists
   */
  async checkEmailExists(email, excludeId = null, isDoubleDatabase = true) {
    const where = { email_indo: email };

    if (excludeId) {
      where.id = { [Op.ne]: excludeId };
    }

    const existing = await this.findOne({ where }, isDoubleDatabase);
    return existing !== null;
  }

  /**
   * Build customer payload from raw request body.
   * @param {Object} body
   * @param {Boolean} isUpdate - if true, only include fields explicitly provided
   */
  _buildCustomerData(body, isUpdate = false) {
    const fields = [
      "customer_type",
      "company_name_indo",
      "company_name_mandarin",
      "is_company_name_same",
      "address_indo",
      "address_mandarin",
      "is_address_same",
      "contact_indo",
      "contact_mandarin",
      "is_contact_same",
      "email_indo",
      "email_mandarin",
      "is_email_same",
      "pic_name_indo",
      "pic_name_mandarin",
      "is_pic_name_same",
      "pic_position_indo",
      "pic_position_mandarin",
      "is_pic_position_same",
      "director_name_indo",
      "director_name_mandarin",
      "is_director_name_same",
      "director_position_indonesian",
      "director_position_mandarin",
      "is_director_position_same",
      "is_active",
    ];

    const data = {};

    if (isUpdate) {
      for (const field of fields) {
        if (body[field] !== undefined) {
          data[field] = body[field];
        }
      }
    } else {
      for (const field of fields) {
        data[field] = body[field];
      }
      data.is_company_name_same = body.is_company_name_same ?? false;
      data.is_address_same = body.is_address_same ?? false;
      data.is_contact_same = body.is_contact_same ?? false;
      data.is_email_same = body.is_email_same ?? false;
      data.is_pic_name_same = body.is_pic_name_same ?? false;
      data.is_pic_position_same = body.is_pic_position_same ?? false;
      data.is_director_name_same = body.is_director_name_same ?? false;
      data.is_director_position_same = body.is_director_position_same ?? false;
      data.is_active = body.is_active !== undefined ? body.is_active : true;
    }

    return data;
  }

  /**
   * Create customer + sync customer_documents files, wrapped in a transaction.
   * @param {Object} body - raw request body (termasuk body.files utk customer_documents)
   * @param {Number|String|null} id_create - id user yang membuat
   * @param {Boolean} isDoubleDatabase
   */
  async createWithRelations(body, id_create, isDoubleDatabase = true) {
    if (!body.customer_type) {
      throw new Error("Customer type is required");
    }

    const dataToCreate = this._buildCustomerData(body, false);

    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Creating Customer with relations in both databases...`);

        const customer1 = await this.Model1.create(dataToCreate, {
          transaction: transaction1,
        });
        console.log(`✅ Created Customer in DB1 with ID: ${customer1.id}`);

        await this.Model2.create(
          { ...dataToCreate, id: customer1.id },
          { transaction: transaction2 },
        );
        console.log(`✅ Created Customer in DB2 with ID: ${customer1.id}`);

        await fileService.syncFiles(
          "customers",
          customer1.id,
          body.customer_documents,
          {
            category: "customer_documents",
            uploadedBy: id_create,
            hardDelete: false,
          },
          transaction1,
          transaction2,
        );

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Customer with relations successfully created`);

        return customer1.toJSON();
      } else {
        transaction1 = await db1.transaction();

        const customer = await this.Model1.create(dataToCreate, {
          transaction: transaction1,
        });

        await fileService.syncFiles(
          "customers",
          customer.id,
          body.customer_documents,
          {
            category: "customer_documents",
            uploadedBy: id_create,
            hardDelete: false,
          },
          transaction1,
          null,
        );

        await transaction1.commit();
        console.log(`✅ Customer created in DB1 only`);

        return customer.toJSON();
      }
    } catch (error) {
      console.error(`❌ Error creating Customer:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to create Customer: ${error.message}`);
    }
  }

  /**
   * Update customer + sync customer_documents files, wrapped in a transaction.
   * @param {Number|String} id
   * @param {Object} body - raw request body (termasuk body.files utk customer_documents)
   * @param {Number|String|null} id_update - id user yang mengupdate
   * @param {Boolean} isDoubleDatabase
   */
  async updateWithRelations(id, body, id_update, isDoubleDatabase = true) {
    const existing = await this.findById(id, {}, isDoubleDatabase);
    if (!existing) {
      throw new Error(`Customer with ID ${id} not found`);
    }

    const dataToUpdate = this._buildCustomerData(body, true);

    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Updating Customer ID ${id}...`);

        const [updatedRows1] = await this.Model1.update(dataToUpdate, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(dataToUpdate, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`Customer with ID ${id} not found`);
        }

        console.log(`✅ Updated Customer in both databases`);

        await fileService.syncFiles(
          "customers",
          id,
          body.customer_documents,
          {
            category: "customer_documents",
            uploadedBy: id_update,
            hardDelete: false,
          },
          transaction1,
          transaction2,
        );

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Customer with relations successfully updated`);

        return await this.getById(id, {}, isDoubleDatabase);
      } else {
        transaction1 = await db1.transaction();

        const [updatedRows] = await this.Model1.update(dataToUpdate, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`Customer with ID ${id} not found`);
        }

        await fileService.syncFiles(
          "customers",
          id,
          body.customer_documents,
          {
            category: "customer_documents",
            uploadedBy: id_update,
            hardDelete: false,
          },
          transaction1,
          null,
        );

        await transaction1.commit();
        console.log(`✅ Customer updated in DB1 only`);

        return await this.getById(id, {}, isDoubleDatabase);
      }
    } catch (error) {
      console.error(`❌ Error updating Customer:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to update Customer: ${error.message}`);
    }
  }

  /**
   * Soft-delete (deactivate) a customer.
   */
  async deleteCustomer(id, isDoubleDatabase = true) {
    const existing = await this.findById(id, {}, isDoubleDatabase);
    if (!existing) {
      throw new Error(`Customer with ID ${id} not found`);
    }

    return await this.update(id, { is_active: false }, isDoubleDatabase);
  }
}

module.exports = new CustomerService();
