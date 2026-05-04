const DualDatabaseService = require("../dualDatabase.service");
const { models, db1, db2 } = require("../../models");
const { where } = require("sequelize");

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
    isDoubleDatabase = true
  ) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.Contract,
          as: "contract",

          include: [
            {
              model: dbModels.Quotation,
              as: "quotation",
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
          model: dbModels.Department,
          as: "department_request",
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

          include: [
            {
              model: dbModels.Quotation,
              as: "quotation",
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
          model: dbModels.Department,
          as: "department_request",
        },
        {
          model: dbModels.PaymentRequestVerificationProgress,
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
    isDoubleDatabase = true
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Creating PaymentRequest with relations in both databases...`
        );

        // 1. Create PaymentRequest in DB1
        const paymentRequest1 = await this.Model1.create(paymentRequestData, {
          transaction: transaction1,
        });
        console.log(
          `✅ Created PaymentRequest in DB1 with ID: ${paymentRequest1.id}`
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
          `✅ Created PaymentRequest in DB2 with ID: ${paymentRequest1.id}`
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
            { transaction: transaction1 }
          );

        const progressDataWithId = {
          ...progressData,
          id: progress1.id,
        };
        await models.db2.PaymentRequestVerificationProgress.create(
          progressDataWithId,
          { transaction: transaction2 }
        );

        console.log(
          `✅ Created PaymentRequestVerificationProgress with status "requested"`
        );

        if (paymentRequestData.id_contract_project_plan) {
          const contractProjectPlan =
            await models.db1.ContractProjectPlan.findByPk(
              paymentRequestData.id_contract_project_plan,
              { transaction: transaction1 }
            );

          if (!contractProjectPlan) {
            throw new Error(
              `ContractProjectPlan with ID ${paymentRequestData.id_contract_project_plan} not found`
            );
          }

          // Update data Contract Project Plan in DB1
          await models.db1.ContractProjectPlan.update(
            {
              payment_type: paymentRequestData.payment_type,
            },
            {
              transaction: transaction1,
              where: { id: paymentRequestData.id_contract_project_plan },
            }
          );

          // Update data Contract Project Plan in DB2
          await models.db2.ContractProjectPlan.update(
            {
              payment_type: paymentRequestData.payment_type,
            },
            {
              transaction: transaction2,
              where: { id: paymentRequestData.id_contract_project_plan },
            }
          );

          console.log(`✅ Update ContractProjectPlan payment type`);
        }

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
            { transaction: transaction1 }
          );

        if (paymentRequestData.id_contract_project_plan) {
          const contractProjectPlan =
            await models.db1.ContractProjectPlan.findByPk(
              paymentRequestData.id_contract_project_plan,
              { transaction: transaction1 }
            );

          if (!contractProjectPlan) {
            throw new Error(
              `ContractProjectPlan with ID ${paymentRequestData.id_contract_project_plan} not found`
            );
          }

          // Update data Contract Project Plan in DB1
          await models.db1.ContractProjectPlan.update(
            {
              payment_type: paymentRequestData.payment_type,
            },
            {
              transaction: transaction1,
              where: { id: paymentRequestData.id_contract_project_plan },
            }
          );

          console.log(`✅ Update ContractProjectPlan payment type`);
        }

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
   * approvePaymentRequest by role
   * @param {String} role - "spv" | "fat" | "spv fat" | "manager fat" | "director"
   * @param {Number} id
   * @param {String} note
   * @param {Number} id_user
   * @param {String} cost_bearer - "customer" | "company" (only for "director")
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated record
   */
  async approvePaymentRequest(
    role,
    id,
    note,
    id_user,
    cost_bearer = null,
    isDoubleDatabase = true
  ) {
    // Whitelist role yang valid
    const VALID_ROLES = ["spv", "fat", "spv fat", "manager fat", "director"];
    if (!VALID_ROLES.includes(role)) {
      throw new Error(
        `Invalid role "${role}". Valid roles: ${VALID_ROLES.join(", ")}`
      );
    }

    let status = `approve ${role}`;

    // Logika khusus hanya untuk director
    if (role === "director") {
      // Kalau cost_bearer tidak diisi, ambil dari database
      if (!cost_bearer) {
        const existingData = await this.getById(id, {}, isDoubleDatabase);
        if (!existingData) {
          throw new Error(`PaymentRequest with ID ${id} not found`);
        }
        cost_bearer = existingData.cost_bearer;
      }

      // Terapkan logika cost_bearer setelah dapat nilainya
      status =
        cost_bearer === "customer"
          ? "continue_to_debit_note"
          : "approve director";
    }

    return this._changeStatus(
      id,
      status,
      { cost_bearer, note, id_user },
      isDoubleDatabase
    );
  }

  /**
   * rejectPaymentRequest by role
   * @param {String} role - "spv" | "fat" | "spv fat" | "manager fat" | "director"
   * @param {Number} id
   * @param {String} note - Required
   * @param {Number} id_user
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated record
   */
  async rejectPaymentRequest(role, id, note, id_user, isDoubleDatabase = true) {
    // Whitelist role yang valid
    const VALID_ROLES = ["spv", "fat", "spv fat", "manager fat", "director"];
    if (!VALID_ROLES.includes(role)) {
      throw new Error(
        `Invalid role "${role}". Valid roles: ${VALID_ROLES.join(", ")}`
      );
    }

    return this._changeStatus(
      id,
      `reject ${role}`,
      { note, id_user },
      isDoubleDatabase
    );
  }

  async paidPaymentRequest(
    id,
    total_payment,
    file_proof_payment,
    note,
    id_user,
    isDoubleDatabase = true
  ) {
    return this._changeStatus(
      id,
      "paid",
      { total_payment, file_proof_payment, note, id_user },
      isDoubleDatabase
    );
  }

  /**
   * Internal method to change payment request status
   * @param {Number} id - Payment request ID
   * @param {String} status - "approved" | "continue_to_debit_note" | "rejected" | "paid"
   * @param {Object} options - Additional options
   * @param {String} options.cost_bearer - "customer" | "company" (required for approve)
   * @param {String} options.note - Note for the status change
   * @param {Number} options.id_user - User ID performing the action
   * @param {Number} options.total_payment - Total payment amount (required for paid)
   * @param {String} options.file_proof_payment - File path of payment proof (required for paid)
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated payment request
   */
  async _changeStatus(id, status, options = {}, isDoubleDatabase = true) {
    const { cost_bearer, note, id_user, total_payment, file_proof_payment } =
      options;

    let transaction1 = null;
    let transaction2 = null;

    try {
      // Build update payload based on status
      const updateData = { status };
      if (cost_bearer) updateData.cost_bearer = cost_bearer;
      if (status === "paid") {
        updateData.total_payment = total_payment;
        updateData.file_proof_payment = file_proof_payment;
      }

      const progressData = {
        id_payment_request: id,
        id_user,
        status,
        note: note || `Payment request ${status}`,
      };

      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        const dataPayment = await this.getById(id, {}, true);

        console.log(
          `🔄 Changing PaymentRequest ID ${id} status to "${status}"...`
        );

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
          `✅ Updated PaymentRequest status to "${status}" in both databases`
        );

        const progress1 =
          await models.db1.PaymentRequestVerificationProgress.create(
            progressData,
            { transaction: transaction1 }
          );

        await models.db2.PaymentRequestVerificationProgress.create(
          { ...progressData, id: progress1.id },
          { transaction: transaction2 }
        );

        console.log(
          `✅ Created PaymentRequestVerificationProgress with status "${status}"`
        );

        if (status === "paid" && dataPayment.id_contract_project_plan_cost) {
          await models.db1.ContractProjectPlanCost.update(
            { is_checked: true, file: file_proof_payment, remarks: note },
            {
              where: { id: dataPayment.id_contract_project_plan_cost },
              transaction: transaction1,
            }
          );

          await models.dbb.ContractProjectPlanCost.update(
            { is_checked: true, file: file_proof_payment, remarks: note },
            {
              where: { id: dataPayment.id_contract_project_plan_cost },
              transaction: transaction2,
            }
          );

          console.log(`✅ Updated Contract Project Plan Cost`);
        }

        await transaction1.commit();
        await transaction2.commit();
        console.log(
          `✅ PaymentRequest status changed to "${status}" successfully`
        );
      } else {
        transaction1 = await db1.transaction();

        const [updatedRows] = await this.Model1.update(updateData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`PaymentRequest with ID ${id} not found`);
        }

        await models.db1.PaymentRequestVerificationProgress.create(
          progressData,
          { transaction: transaction1 }
        );

        await transaction1.commit();
        console.log(
          `✅ PaymentRequest status changed to "${status}" in DB1 only`
        );
      }

      return await this.getById(id, {}, isDoubleDatabase);
    } catch (error) {
      console.error(`❌ Error changing PaymentRequest status:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(
        `Failed to change PaymentRequest status: ${error.message}`
      );
    }
  }
}

module.exports = new PaymentRequestService();
