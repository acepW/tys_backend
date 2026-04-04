const DualDatabaseService = require("../dualDatabase.service");
const { models, db1, db2 } = require("../../models");

class PaymentRequestService extends DualDatabaseService {
  constructor() {
    super("PaymentRequest");
  }

  /**
   * Get all payment requests with relations
   * @param {Object} options - Query options
   * @param {Number} page - Page number for pagination
   * @param {Number} limit - Number of records per page
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Payment requests with relations
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
          model: dbModels.Contract,
          as: "contract",
          attributes: [
            "id",
            "contract_no",
            "contract_title_indo",
            "contract_title_mandarin",
          ],
          include: [
            {
              model: dbModels.Quotation,
              as: "quotation",
              attributes: ["id", "quotation_no"],
            },
          ],
        },
        {
          model: dbModels.ContractService,
          as: "contract_service",
        },
        {
          model: dbModels.ContractProjectPlan,
          as: "contract_project_plan",
        },
        {
          model: dbModels.DebitNote,
          as: "debit_notes",
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
          as: "user_request",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.PaymentRequestVerificationProgress,
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
   * Get payment request by ID with relations
   * @param {Number} id
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Payment request with relations
   */
  async getById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.Contract,
          as: "contract",
          attributes: [
            "id",
            "contract_no",
            "contract_title_indo",
            "contract_title_mandarin",
          ],
          include: [
            {
              model: dbModels.Quotation,
              as: "quotation",
              attributes: ["id", "quotation_no"],
            },
          ],
        },
        {
          model: dbModels.ContractService,
          as: "contract_service",
        },
        {
          model: dbModels.ContractProjectPlan,
          as: "contract_project_plan",
        },
        {
          model: dbModels.DebitNote,
          as: "debit_notes",
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
          as: "user_request",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.PaymentRequestVerificationProgress,
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
   * Create payment request with initial verification progress
   * @param {Object} paymentRequestData - Payment request data
   * @param {Number} id_user_create - User ID who creates
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Created payment request with relations
   */
  async createWithRelations(
    paymentRequestData,
    id_user_create,
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Creating PaymentRequest with relations in both databases...`,
        );

        // 1. Create PaymentRequest in DB1
        const paymentRequest1 = await this.Model1.create(paymentRequestData, {
          transaction: transaction1,
        });
        console.log(
          `✅ Created PaymentRequest in DB1 with ID: ${paymentRequest1.id}`,
        );

        // 2. Create PaymentRequest in DB2 with same ID
        const paymentRequestDataWithId = {
          ...paymentRequestData,
          id: paymentRequest1.id,
        };
        await this.Model2.create(paymentRequestDataWithId, {
          transaction: transaction2,
        });
        console.log(
          `✅ Created PaymentRequest in DB2 with ID: ${paymentRequest1.id}`,
        );

        // 3. Create initial verification progress with status "requested"
        const progressData = {
          id_payment_request: paymentRequest1.id,
          id_user: id_user_create,
          status: "requested",
          note: "Payment request created",
        };

        const progress1 =
          await models.db1.PaymentRequestVerificationProgress.create(
            progressData,
            { transaction: transaction1 },
          );

        const progressDataWithId = {
          ...progressData,
          id: progress1.id,
        };
        await models.db2.PaymentRequestVerificationProgress.create(
          progressDataWithId,
          { transaction: transaction2 },
        );

        console.log(
          `✅ Created PaymentRequestVerificationProgress with status "requested"`,
        );

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ PaymentRequest with relations successfully created`);

        return {
          payment_request: paymentRequest1.toJSON(),
          verification_progress: progress1.toJSON(),
        };
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const paymentRequest = await this.Model1.create(paymentRequestData, {
          transaction: transaction1,
        });

        const progressData = {
          id_payment_request: paymentRequest.id,
          id_user: id_user_create,
          status: "requested",
          note: "Payment request created",
        };

        const progress =
          await models.db1.PaymentRequestVerificationProgress.create(
            progressData,
            { transaction: transaction1 },
          );

        await transaction1.commit();
        console.log(`✅ PaymentRequest created in DB1 only`);

        return {
          payment_request: paymentRequest.toJSON(),
          verification_progress: progress.toJSON(),
        };
      }
    } catch (error) {
      console.error(`❌ Error creating PaymentRequest:`, error.message);

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(`Failed to create PaymentRequest: ${error.message}`);
    }
  }

  /**
   * Approve payment request
   * - If payer = "customer" → contract status = "continue_to_debit_note", progress status = "approved"
   * - If payer = "company" → contract status = "approved", progress status = "approved"
   * @param {Number} id - Payment request ID
   * @param {String} payer - "customer" or "company"
   * @param {String} note - Approval note
   * @param {Number} id_user - User ID who approves
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated payment request
   */
  async approvePaymentRequest(
    id,
    payer,
    note,
    id_user,
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      // Determine contract status based on payer
      const contractStatus =
        payer === "customer" ? "continue_to_debit_note" : "approved";

      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Approving PaymentRequest ID ${id} with payer "${payer}"...`,
        );

        // 1. Update PaymentRequest status + payer in both databases
        const updateData = {
          status: contractStatus,
          payer,
        };

        const [updatedRows1] = await this.Model1.update(updateData, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(updateData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`PaymentRequest with ID ${id} not found`);
        }

        console.log(
          `✅ Updated PaymentRequest status to "${contractStatus}" in both databases`,
        );

        // 2. Create verification progress with status "approved"
        const progressData = {
          id_payment_request: id,
          id_user,
          status: "approved",
          note: note || "Payment request approved",
        };

        const progress1 =
          await models.db1.PaymentRequestVerificationProgress.create(
            progressData,
            { transaction: transaction1 },
          );

        const progressDataWithId = {
          ...progressData,
          id: progress1.id,
        };
        await models.db2.PaymentRequestVerificationProgress.create(
          progressDataWithId,
          { transaction: transaction2 },
        );

        console.log(
          `✅ Created PaymentRequestVerificationProgress with status "approved"`,
        );

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ PaymentRequest approved successfully`);

        return await this.getById(id, {}, isDoubleDatabase);
      } else {
        transaction1 = await db1.transaction();

        const updateData = {
          status: contractStatus,
          payer,
        };

        const [updatedRows] = await this.Model1.update(updateData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`PaymentRequest with ID ${id} not found`);
        }

        const progressData = {
          id_payment_request: id,
          id_user,
          status: "approved",
          note: note || "Payment request approved",
        };

        await models.db1.PaymentRequestVerificationProgress.create(
          progressData,
          { transaction: transaction1 },
        );

        await transaction1.commit();
        console.log(`✅ PaymentRequest approved in DB1 only`);

        return await this.getById(id, {}, isDoubleDatabase);
      }
    } catch (error) {
      console.error(`❌ Error approving PaymentRequest:`, error.message);

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(`Failed to approve PaymentRequest: ${error.message}`);
    }
  }

  /**
   * Reject payment request
   * @param {Number} id - Payment request ID
   * @param {String} note - Rejection note (required)
   * @param {Number} id_user - User ID who rejects
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated payment request
   */
  async rejectPaymentRequest(id, note, id_user, isDoubleDatabase = true) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Rejecting PaymentRequest ID ${id}...`);

        const [updatedRows1] = await this.Model1.update(
          { status: "rejected" },
          { where: { id }, transaction: transaction1 },
        );

        const [updatedRows2] = await this.Model2.update(
          { status: "rejected" },
          { where: { id }, transaction: transaction2 },
        );

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`PaymentRequest with ID ${id} not found`);
        }

        console.log(
          `✅ Updated PaymentRequest status to "rejected" in both databases`,
        );

        const progressData = {
          id_payment_request: id,
          id_user,
          status: "rejected",
          note: note,
        };

        const progress1 =
          await models.db1.PaymentRequestVerificationProgress.create(
            progressData,
            { transaction: transaction1 },
          );

        const progressDataWithId = {
          ...progressData,
          id: progress1.id,
        };
        await models.db2.PaymentRequestVerificationProgress.create(
          progressDataWithId,
          { transaction: transaction2 },
        );

        console.log(
          `✅ Created PaymentRequestVerificationProgress with status "rejected"`,
        );

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ PaymentRequest rejected successfully`);

        return await this.getById(id, {}, isDoubleDatabase);
      } else {
        transaction1 = await db1.transaction();

        const [updatedRows] = await this.Model1.update(
          { status: "rejected" },
          { where: { id }, transaction: transaction1 },
        );

        if (updatedRows === 0) {
          throw new Error(`PaymentRequest with ID ${id} not found`);
        }

        const progressData = {
          id_payment_request: id,
          id_user,
          status: "rejected",
          note: note,
        };

        await models.db1.PaymentRequestVerificationProgress.create(
          progressData,
          { transaction: transaction1 },
        );

        await transaction1.commit();
        console.log(`✅ PaymentRequest rejected in DB1 only`);

        return await this.getById(id, {}, isDoubleDatabase);
      }
    } catch (error) {
      console.error(`❌ Error rejecting PaymentRequest:`, error.message);

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(`Failed to reject PaymentRequest: ${error.message}`);
    }
  }

  /**
   * Mark payment request as paid
   * @param {Number} id - Payment request ID
   * @param {Number} total_payment - Total payment amount
   * @param {String} file_proof_payment - File path of payment proof
   * @param {String} note - Note
   * @param {Number} id_user - User ID who marks as paid
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated payment request
   */
  async paidPaymentRequest(
    id,
    total_payment,
    file_proof_payment,
    note,
    id_user,
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Marking PaymentRequest ID ${id} as paid...`);

        const updateData = {
          status: "paid",
          total_payment,
          file_proof_payment,
        };

        const [updatedRows1] = await this.Model1.update(updateData, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(updateData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`PaymentRequest with ID ${id} not found`);
        }

        console.log(
          `✅ Updated PaymentRequest status to "paid" in both databases`,
        );

        const progressData = {
          id_payment_request: id,
          id_user,
          status: "paid",
          note: note || "Payment request paid",
        };

        const progress1 =
          await models.db1.PaymentRequestVerificationProgress.create(
            progressData,
            { transaction: transaction1 },
          );

        const progressDataWithId = {
          ...progressData,
          id: progress1.id,
        };
        await models.db2.PaymentRequestVerificationProgress.create(
          progressDataWithId,
          { transaction: transaction2 },
        );

        console.log(
          `✅ Created PaymentRequestVerificationProgress with status "paid"`,
        );

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ PaymentRequest marked as paid successfully`);

        return await this.getById(id, {}, isDoubleDatabase);
      } else {
        transaction1 = await db1.transaction();

        const updateData = {
          status: "paid",
          total_payment,
          file_proof_payment,
        };

        const [updatedRows] = await this.Model1.update(updateData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`PaymentRequest with ID ${id} not found`);
        }

        const progressData = {
          id_payment_request: id,
          id_user,
          status: "paid",
          note: note || "Payment request paid",
        };

        await models.db1.PaymentRequestVerificationProgress.create(
          progressData,
          { transaction: transaction1 },
        );

        await transaction1.commit();
        console.log(`✅ PaymentRequest marked as paid in DB1 only`);

        return await this.getById(id, {}, isDoubleDatabase);
      }
    } catch (error) {
      console.error(`❌ Error marking PaymentRequest as paid:`, error.message);

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(
        `Failed to mark PaymentRequest as paid: ${error.message}`,
      );
    }
  }
}

module.exports = new PaymentRequestService();
