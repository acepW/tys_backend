const DualDatabaseService = require("../dualDatabase.service");
const { models, db1, db2 } = require("../../models");

class VendorService extends DualDatabaseService {
  constructor() {
    super("Vendor");
  }

  /**
   * Get all vendors with relations
   * @param {Object} options - Query options
   * @param {Number} page - Page number for pagination
   * @param {Number} limit - Number of records per page
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Vendors with relations
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
          model: dbModels.VendorVerificationProgress,
          as: "verification_progress",
          separate: true,
          include: [
            {
              model: dbModels.User,
              as: "user",
              attributes: ["id", "name", "email"],
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
   * @param {Number} id
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Vendor with relations
   */
  async getById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.VendorVerificationProgress,
          as: "verification_progress",
          include: [
            {
              model: dbModels.User,
              as: "user",
              attributes: ["id", "name", "email"],
            },
          ],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Create vendor with initial verification progress
   * @param {Object} vendorData - Vendor data
   * @param {Number} id_user_create - User ID who creates
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Created vendor with relations
   */
  async createWithRelations(
    vendorData,
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
          {
            transaction: transaction1,
          }
        );

        await models.db2.VendorVerificationProgress.create(
          { ...progressData, id: progress1.id },
          { transaction: transaction2 }
        );

        console.log(
          `✅ Created VendorVerificationProgress with status "requested"`
        );

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Vendor with relations successfully created`);

        return {
          vendor: vendor1.toJSON(),
          verification_progress: progress1.toJSON(),
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

        await transaction1.commit();
        console.log(`✅ Vendor created in DB1 only`);

        return {
          vendor: vendor.toJSON(),
          verification_progress: progress.toJSON(),
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
   * Approve vendor — sets status to "approve" and is_active to true
   * @param {Number} id
   * @param {String} note
   * @param {Number} id_user
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated vendor
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
   * @param {Number} id
   * @param {String} note - Required
   * @param {Number} id_user
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated vendor
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
   * @param {Number} id - Vendor ID
   * @param {String} status - "approve" | "reject"
   * @param {Object} options
   * @param {String} options.note
   * @param {Number} options.id_user
   * @param {Boolean} options.is_active
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated vendor
   */
  async _changeStatus(id, status, options = {}, isDoubleDatabase = true) {
    const { note, id_user, is_active } = options;

    let transaction1 = null;
    let transaction2 = null;

    try {
      console.log(id, status, (options = {}));
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
          {
            transaction: transaction1,
          }
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
