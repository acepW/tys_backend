const DualDatabaseService = require("../dualDatabase.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");

class VendorService extends DualDatabaseService {
  constructor() {
    super("Vendor");
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
          model: dbModels.User,
          as: "user_request",
        },
        {
          model: dbModels.Department,
          as: "department_request",
        },
        {
          model: dbModels.VendorVerificationProgress,
          as: "verification_progress",
          separate: true,
          include: [
            {
              model: dbModels.User,
              as: "user",
              attributes: ["id", "name", "email"],
              include: [
                {
                  model: dbModels.Department,
                  as: "department",
                },
                {
                  model: dbModels.Position,
                  as: "position",
                },
              ],
            },
          ],
        },
        {
          model: dbModels.VendorService,
          as: "vendor_service",
          separate: true,
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
          model: dbModels.User,
          as: "user_request",
        },
        {
          model: dbModels.Department,
          as: "department_request",
        },
        {
          model: dbModels.VendorVerificationProgress,
          as: "verification_progress",
          include: [
            {
              model: dbModels.User,
              as: "user",
              attributes: ["id", "name", "email"],
              include: [
                {
                  model: dbModels.Department,
                  as: "department",
                },
                {
                  model: dbModels.Position,
                  as: "position",
                },
              ],
            },
          ],
        },
        {
          model: dbModels.VendorService,
          as: "vendor_service",
          separate: true,
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Create vendor with initial verification progress and vendor services
   * @param {Object} vendorData - Vendor data
   * @param {Array} vendorServices - Array of vendor service items
   * @param {Number} id_user_create - User ID who creates
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Created vendor with relations
   */
  async createWithRelations(
    vendorData,
    vendorServices = [],
    id_user_create,
    isDoubleDatabase = true
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      const dataToCreate = {
        ...vendorData,
        status: "pending",
        is_active: false,
      };

      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Creating Vendor with relations in both databases...`);

        // 1. Create Vendor in DB1
        const vendor1 = await this.Model1.create(dataToCreate, {
          transaction: transaction1,
        });
        console.log(`✅ Created Vendor in DB1 with ID: ${vendor1.id}`);

        // 2. Create Vendor in DB2 with same ID
        await this.Model2.create(
          { ...dataToCreate, id: vendor1.id },
          { transaction: transaction2 }
        );
        console.log(`✅ Created Vendor in DB2 with ID: ${vendor1.id}`);

        // 3. Create initial verification progress with status "requested"
        const progressData = {
          id_vendor: vendor1.id,
          id_user: id_user_create,
          status: "requested",
          note: "Vendor created, waiting for approval",
          is_active: true,
        };

        const progress1 = await models.db1.VendorVerificationProgress.create(
          progressData,
          { transaction: transaction1 }
        );

        await models.db2.VendorVerificationProgress.create(
          { ...progressData, id: progress1.id },
          { transaction: transaction2 }
        );

        console.log(
          `✅ Created VendorVerificationProgress with status "requested"`
        );

        // 4. Sync Vendor Services
        const servicesData = vendorServices.map((service) => ({
          ...service,
          id_vendor: vendor1.id,
        }));

        const servicesResult = await syncChildRecords({
          Model1: models.db1.VendorService,
          Model2: models.db2.VendorService,
          foreignKey: "id_vendor",
          parentId: vendor1.id,
          newData: servicesData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        console.log(
          `✅ Synced ${servicesResult.created?.length || 0} Vendor Services`
        );

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Vendor with relations successfully created`);

        return {
          vendor: vendor1.toJSON(),
          verification_progress: progress1.toJSON(),
          vendor_services: servicesResult,
        };
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const vendor = await this.Model1.create(dataToCreate, {
          transaction: transaction1,
        });

        const progressData = {
          id_vendor: vendor.id,
          id_user: id_user_create,
          status: "requested",
          note: "Vendor created, waiting for approval",
          is_active: true,
        };

        const progress = await models.db1.VendorVerificationProgress.create(
          progressData,
          { transaction: transaction1 }
        );

        const servicesData = vendorServices.map((service) => ({
          ...service,
          id_vendor: vendor.id,
        }));

        const servicesResult = await syncChildRecords({
          Model1: models.db1.VendorService,
          Model2: null,
          foreignKey: "id_vendor",
          parentId: vendor.id,
          newData: servicesData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        console.log(
          `✅ Synced ${servicesResult.created?.length || 0} Vendor Services`
        );

        await transaction1.commit();
        console.log(`✅ Vendor created in DB1 only`);

        return {
          vendor: vendor.toJSON(),
          verification_progress: progress.toJSON(),
          vendor_services: servicesResult,
        };
      }
    } catch (error) {
      console.error(`❌ Error creating Vendor:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to create Vendor: ${error.message}`);
    }
  }

  /**
   * Update vendor with vendor services (create/update/delete)
   * @param {Number} id - Vendor ID
   * @param {Object} vendorData - Vendor data to update
   * @param {Array} vendorServices - Vendor services array
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated vendor with all relations
   */
  async updateWithRelations(
    id,
    vendorData,
    vendorServices = [],
    isDoubleDatabase = true
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Updating Vendor ID ${id} with services...`);

        // 1. Update Vendor in both databases
        const [updatedRows1] = await this.Model1.update(vendorData, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(vendorData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`Vendor with ID ${id} not found`);
        }

        console.log(`✅ Updated Vendor in both databases`);

        // 2. Sync Vendor Services (syncChildRecords handles create/update/delete)
        const servicesData = vendorServices.map((service) => ({
          ...service,
          id_vendor: id,
        }));

        const servicesResult = await syncChildRecords({
          Model1: models.db1.VendorService,
          Model2: models.db2.VendorService,
          foreignKey: "id_vendor",
          parentId: id,
          newData: servicesData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        console.log(`✅ Synced Vendor Services`);

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Vendor with all relations successfully updated`);

        return await this.getById(id, {}, isDoubleDatabase);
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const [updatedRows] = await this.Model1.update(vendorData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`Vendor with ID ${id} not found`);
        }

        const servicesData = vendorServices.map((service) => ({
          ...service,
          id_vendor: id,
        }));

        await syncChildRecords({
          Model1: models.db1.VendorService,
          Model2: null,
          foreignKey: "id_vendor",
          parentId: id,
          newData: servicesData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        await transaction1.commit();
        console.log(`✅ Vendor updated in DB1 only`);

        return await this.getById(id, {}, isDoubleDatabase);
      }
    } catch (error) {
      console.error(`❌ Error updating Vendor:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to update Vendor: ${error.message}`);
    }
  }

  /**
   * Approve vendor — sets status to "approve" and is_active to true
   */
  async approveVendor(id, note, id_user, isDoubleDatabase = true) {
    return this._changeStatus(
      id,
      "approve",
      { note, id_user, is_active: true },
      isDoubleDatabase
    );
  }

  /**
   * Reject vendor — sets status to "reject" and is_active remains false
   */
  async rejectVendor(id, note, id_user, isDoubleDatabase = true) {
    return this._changeStatus(
      id,
      "reject",
      { note, id_user, is_active: false },
      isDoubleDatabase
    );
  }

  /**
   * Internal method to change vendor status
   */
  async _changeStatus(id, status, options = {}, isDoubleDatabase = true) {
    const { note, id_user, is_active } = options;

    let transaction1 = null;
    let transaction2 = null;

    try {
      const updateData = { status };
      if (is_active !== undefined) updateData.is_active = is_active;

      const progressData = {
        id_vendor: id,
        id_user,
        status,
        note: note || `Vendor ${status}`,
        is_active: true,
      };

      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Changing Vendor ID ${id} status to "${status}"...`);

        const [updatedRows1] = await this.Model1.update(updateData, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(updateData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`Vendor with ID ${id} not found`);
        }

        console.log(
          `✅ Updated Vendor status to "${status}" in both databases`
        );

        const progress1 = await models.db1.VendorVerificationProgress.create(
          progressData,
          { transaction: transaction1 }
        );

        await models.db2.VendorVerificationProgress.create(
          { ...progressData, id: progress1.id },
          { transaction: transaction2 }
        );

        console.log(
          `✅ Created VendorVerificationProgress with status "${status}"`
        );

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Vendor status changed to "${status}" successfully`);
      } else {
        transaction1 = await db1.transaction();

        const [updatedRows] = await this.Model1.update(updateData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`Vendor with ID ${id} not found`);
        }

        await models.db1.VendorVerificationProgress.create(progressData, {
          transaction: transaction1,
        });

        await transaction1.commit();
        console.log(`✅ Vendor status changed to "${status}" in DB1 only`);
      }

      return await this.getById(id, {}, isDoubleDatabase);
    } catch (error) {
      console.error(`❌ Error changing Vendor status:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to change Vendor status: ${error.message}`);
    }
  }
}

module.exports = new VendorService();
