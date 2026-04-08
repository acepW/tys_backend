const DualDatabaseService = require("../dualDatabase.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");

class ContractProjectPlanService extends DualDatabaseService {
  constructor() {
    super("ContractProjectPlan");
  }

  /**
   * Get all contract project plans with relations
   * @param {Object} options - Query options
   * @param {Number} page
   * @param {Number} limit
   * @param {Boolean} isDoubleDatabase
   * @returns {Array|Object} Contract project plans with relations
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
          model: dbModels.ContractProjectPlanPoint,
          as: "contract_project_plan_points",
          separate: true,
          include: [
            {
              model: dbModels.User,
              as: "user",
              attributes: ["id", "name", "email"],
            },
          ],
          attributes: [
            "id",
            "file_description_indo",
            "file_description_mandarin",
            "is_checked",
            "remarks",
            "file",
            "is_active",
          ],
        },
        {
          model: dbModels.ContractProjectPlanCost,
          as: "contract_project_plan_costs",
          attributes: [
            "id",
            "cost_description_indo",
            "cost_description_mandarin",
            "price_idr",
            "price_rmb",
            "is_checked",
            "remarks",
            "file",
            "is_active",
          ],
          include: [
            {
              model: dbModels.User,
              as: "user",
              attributes: ["id", "name", "email"],
            },
          ],
        },
        {
          model: dbModels.PaymentRequest,
          as: "payment_requests",
        },
        {
          model: dbModels.ContractService,
          as: "contract_service",
          attributes: ["id", "status"],
        },
        {
          model: dbModels.User,
          as: "user_started",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_stopped",
          attributes: ["id", "name", "email"],
        },
      ],
      order: [["plan_start_date", "ASC"]],
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
   * Get contract project plan by ID with relations
   * @param {Number} id
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Contract project plan with relations
   */
  async getById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.ContractProjectPlanPoint,
          as: "contract_project_plan_points",
          separate: true,
          include: [
            {
              model: dbModels.User,
              as: "user",
              attributes: ["id", "name", "email"],
            },
          ],
          attributes: [
            "id",
            "file_description_indo",
            "file_description_mandarin",
            "is_checked",
            "remarks",
            "file",
            "is_active",
          ],
        },
        {
          model: dbModels.ContractProjectPlanCost,
          as: "contract_project_plan_costs",
          attributes: [
            "id",
            "cost_description_indo",
            "cost_description_mandarin",
            "price_idr",
            "price_rmb",
            "is_checked",
            "remarks",
            "file",
            "is_active",
          ],
          include: [
            {
              model: dbModels.User,
              as: "user",
              attributes: ["id", "name", "email"],
            },
          ],
        },
        {
          model: dbModels.PaymentRequest,
          as: "payment_requests",
        },
        {
          model: dbModels.ContractService,
          as: "contract_service",
          attributes: ["id", "status"],
        },
        {
          model: dbModels.User,
          as: "user_started",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_stopped",
          attributes: ["id", "name", "email"],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Create multiple contract project plans with points in a single transaction
   *
   * @param {Array} contractProjectPlanDataList - Array of contract project plan data with points
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Array} Created contract project plans with points
   */
  async createMultipleWithPoints(
    contractProjectPlanDataList = [],
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Creating ${contractProjectPlanDataList.length} Contract Project Plan records with points in both databases...`,
        );

        const results = [];

        for (const item of contractProjectPlanDataList) {
          const {
            contract_project_plan_points = [],
            contract_project_plan_costs = [],
            ...contractProjectPlanData
          } = item;

          // 1. Create Contract Project Plan in DB1
          const contractProjectPlan1 = await this.Model1.create(
            contractProjectPlanData,
            { transaction: transaction1 },
          );
          console.log(
            `✅ Created Contract Project Plan in DB1 with ID: ${contractProjectPlan1.id}`,
          );

          // 2. Create Contract Project Plan in DB2 with same ID
          const contractProjectPlanDataWithId = {
            ...contractProjectPlanData,
            id: contractProjectPlan1.id,
          };
          await this.Model2.create(contractProjectPlanDataWithId, {
            transaction: transaction2,
          });
          console.log(
            `✅ Created Contract Project Plan in DB2 with ID: ${contractProjectPlan1.id}`,
          );

          // 3. Prepare points data with foreign key
          const pointsData = contract_project_plan_points.map((point) => ({
            ...point,
            id_contract_project_plan: contractProjectPlan1.id,
          }));

          // 4. Sync Contract Project Plan Points
          const pointsResult = await syncChildRecords({
            Model1: models.db1.ContractProjectPlanPoint,
            Model2: models.db2.ContractProjectPlanPoint,
            foreignKey: "id_contract_project_plan",
            parentId: contractProjectPlan1.id,
            newData: pointsData,
            transaction1,
            transaction2,
            isDoubleDatabase,
          });

          // 5. Prepare costs data with foreign key
          const costsData = contract_project_plan_costs.map((cost) => ({
            ...cost,
            id_contract_project_plan: contractProjectPlan1.id,
          }));

          // 6. Sync Contract Project Plan Costs
          const costsResult = await syncChildRecords({
            Model1: models.db1.ContractProjectPlanCost,
            Model2: models.db2.ContractProjectPlanCost,
            foreignKey: "id_contract_project_plan",
            parentId: contractProjectPlan1.id,
            newData: costsData,
            transaction1,
            transaction2,
            isDoubleDatabase,
          });

          results.push({
            contract_project_plan: contractProjectPlan1.toJSON(),
            contract_project_plan_points: pointsResult,
            contract_project_plan_costs: costsResult,
          });
        }

        await transaction1.commit();
        await transaction2.commit();
        console.log(
          `✅ ${contractProjectPlanDataList.length} Contract Project Plan records with points successfully created`,
        );

        return results;
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const results = [];

        for (const item of contractProjectPlanDataList) {
          const {
            contract_project_plan_points = [],
            contract_project_plan_costs = [],
            ...contractProjectPlanData
          } = item;

          const contractProjectPlan = await this.Model1.create(
            contractProjectPlanData,
            { transaction: transaction1 },
          );

          const pointsData = contract_project_plan_points.map((point) => ({
            ...point,
            id_contract_project_plan: contractProjectPlan.id,
          }));

          const pointsResult = await syncChildRecords({
            Model1: models.db1.ContractProjectPlanPoint,
            Model2: null,
            foreignKey: "id_contract_project_plan",
            parentId: contractProjectPlan.id,
            newData: pointsData,
            transaction1,
            transaction2: null,
            isDoubleDatabase: false,
          });

          const costsData = contract_project_plan_costs.map((cost) => ({
            ...cost,
            id_contract_project_plan: contractProjectPlan.id,
          }));

          const costsResult = await syncChildRecords({
            Model1: models.db1.ContractProjectPlanCost,
            Model2: null,
            foreignKey: "id_contract_project_plan",
            parentId: contractProjectPlan.id,
            newData: costsData,
            transaction1,
            transaction2: null,
            isDoubleDatabase,
          });

          results.push({
            contract_project_plan: contractProjectPlan.toJSON(),
            contract_project_plan_points: pointsResult,
            contract_project_plan_costs: costsResult,
          });
        }

        await transaction1.commit();
        console.log(
          `✅ ${contractProjectPlanDataList.length} Contract Project Plan records created in DB1 only`,
        );

        return results;
      }
    } catch (error) {
      console.error(
        `❌ Error creating Contract Project Plan with points:`,
        error.message,
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(
        `Failed to create Contract Project Plan with points: ${error.message}`,
      );
    }
  }

  /**
   * Sync all contract project plans (and their points) by id_contract_service in a single transaction.
   * Plans with id → update, without id → create, missing from list → delete.
   *
   * @param {Number} idContractService - Contract Service ID
   * @param {Array} contractProjectPlanDataList - Array of contract project plan data with points
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Array} Final state of all contract project plans under this contract service
   */
  async syncByContractService(
    idContractService,
    contractProjectPlanDataList = [],
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Syncing Contract Project Plans for ContractService ID ${idContractService} in both databases...`,
        );

        const existingPlans = await this.Model1.findAll({
          where: { id_contract_service: idContractService },
          attributes: ["id"],
          transaction: transaction1,
        });
        const existingIds = existingPlans.map((p) => p.id);

        const incomingIds = contractProjectPlanDataList
          .filter((item) => item.id)
          .map((item) => item.id);

        const idsToDelete = existingIds.filter(
          (id) => !incomingIds.includes(id),
        );

        if (idsToDelete.length > 0) {
          await models.db1.ContractProjectPlanPoint.destroy({
            where: { id_contract_project_plan: idsToDelete },
            transaction: transaction1,
          });
          await models.db2.ContractProjectPlanPoint.destroy({
            where: { id_contract_project_plan: idsToDelete },
            transaction: transaction2,
          });

          // ✅ Delete costs
          await models.db1.ContractProjectPlanCost.destroy({
            where: { id_contract_project_plan: idsToDelete },
            transaction: transaction1,
          });
          await models.db2.ContractProjectPlanCost.destroy({
            where: { id_contract_project_plan: idsToDelete },
            transaction: transaction2,
          });

          await this.Model1.destroy({
            where: { id: idsToDelete },
            transaction: transaction1,
          });
          await this.Model2.destroy({
            where: { id: idsToDelete },
            transaction: transaction2,
          });

          console.log(
            `🗑️ Deleted Contract Project Plan IDs: ${idsToDelete.join(", ")}`,
          );
        }

        const results = [];

        for (const item of contractProjectPlanDataList) {
          // ✅ Destructure contract_project_plan_costs
          const {
            id,
            contract_project_plan_points = [],
            contract_project_plan_costs = [],
            ...planData
          } = item;

          planData.id_contract_service = idContractService;

          let planId;

          if (id && existingIds.includes(id)) {
            await this.Model1.update(planData, {
              where: { id },
              transaction: transaction1,
            });
            await this.Model2.update(planData, {
              where: { id },
              transaction: transaction2,
            });
            planId = id;
            console.log(`✅ Updated Contract Project Plan ID ${planId}`);
          } else {
            const newPlan = await this.Model1.create(planData, {
              transaction: transaction1,
            });
            await this.Model2.create(
              { ...planData, id: newPlan.id },
              { transaction: transaction2 },
            );
            planId = newPlan.id;
            console.log(`✅ Created Contract Project Plan ID ${planId}`);
          }

          // Sync points
          const pointsWithFk = contract_project_plan_points.map((point) => ({
            ...point,
            id_contract_project_plan: planId,
          }));

          await syncChildRecords({
            Model1: models.db1.ContractProjectPlanPoint,
            Model2: models.db2.ContractProjectPlanPoint,
            foreignKey: "id_contract_project_plan",
            parentId: planId,
            newData: pointsWithFk,
            transaction1,
            transaction2,
            isDoubleDatabase,
          });

          // ✅ Sync costs
          const costsWithFk = contract_project_plan_costs.map((cost) => ({
            ...cost,
            id_contract_project_plan: planId,
          }));

          await syncChildRecords({
            Model1: models.db1.ContractProjectPlanCost,
            Model2: models.db2.ContractProjectPlanCost,
            foreignKey: "id_contract_project_plan",
            parentId: planId,
            newData: costsWithFk,
            transaction1,
            transaction2,
            isDoubleDatabase,
          });

          results.push(planId);
        }

        await transaction1.commit();
        await transaction2.commit();
        console.log(
          `✅ Contract Project Plans synced for ContractService ID ${idContractService}`,
        );

        const finalRecords = await this.Model1.findAll({
          where: { id_contract_service: idContractService },
          include: [
            {
              model: models.db1.ContractProjectPlanPoint,
              as: "contract_project_plan_points",
            },
            // ✅ Include costs di final fetch
            {
              model: models.db1.ContractProjectPlanCost,
              as: "contract_project_plan_costs",
            },
          ],
        });

        return finalRecords.map((r) => r.toJSON());
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        console.log(
          `🔄 Syncing Contract Project Plans for ContractService ID ${idContractService} in DB1...`,
        );

        const existingPlans = await this.Model1.findAll({
          where: { id_contract_service: idContractService },
          attributes: ["id"],
          transaction: transaction1,
        });
        const existingIds = existingPlans.map((p) => p.id);

        const incomingIds = contractProjectPlanDataList
          .filter((item) => item.id)
          .map((item) => item.id);

        const idsToDelete = existingIds.filter(
          (id) => !incomingIds.includes(id),
        );

        if (idsToDelete.length > 0) {
          await models.db1.ContractProjectPlanPoint.destroy({
            where: { id_contract_project_plan: idsToDelete },
            transaction: transaction1,
          });

          // ✅ Delete costs
          await models.db1.ContractProjectPlanCost.destroy({
            where: { id_contract_project_plan: idsToDelete },
            transaction: transaction1,
          });

          await this.Model1.destroy({
            where: { id: idsToDelete },
            transaction: transaction1,
          });
          console.log(
            `🗑️ Deleted Contract Project Plan IDs: ${idsToDelete.join(", ")}`,
          );
        }

        for (const item of contractProjectPlanDataList) {
          // ✅ Destructure contract_project_plan_costs
          const {
            id,
            contract_project_plan_points = [],
            contract_project_plan_costs = [],
            ...planData
          } = item;

          planData.id_contract_service = idContractService;

          let planId;

          if (id && existingIds.includes(id)) {
            await this.Model1.update(planData, {
              where: { id },
              transaction: transaction1,
            });
            planId = id;
            console.log(`✅ Updated Contract Project Plan ID ${planId}`);
          } else {
            const newPlan = await this.Model1.create(planData, {
              transaction: transaction1,
            });
            planId = newPlan.id;
            console.log(`✅ Created Contract Project Plan ID ${planId}`);
          }

          const pointsWithFk = contract_project_plan_points.map((point) => ({
            ...point,
            id_contract_project_plan: planId,
          }));

          await syncChildRecords({
            Model1: models.db1.ContractProjectPlanPoint,
            Model2: null,
            foreignKey: "id_contract_project_plan",
            parentId: planId,
            newData: pointsWithFk,
            transaction1,
            transaction2: null,
            isDoubleDatabase: false,
          });

          // ✅ Sync costs
          const costsWithFk = contract_project_plan_costs.map((cost) => ({
            ...cost,
            id_contract_project_plan: planId,
          }));

          await syncChildRecords({
            Model1: models.db1.ContractProjectPlanCost,
            Model2: null,
            foreignKey: "id_contract_project_plan",
            parentId: planId,
            newData: costsWithFk,
            transaction1,
            transaction2: null,
            isDoubleDatabase: false,
          });
        }

        await transaction1.commit();
        console.log(
          `✅ Contract Project Plans synced for ContractService ID ${idContractService} in DB1`,
        );

        const finalRecords = await this.Model1.findAll({
          where: { id_contract_service: idContractService },
          include: [
            {
              model: models.db1.ContractProjectPlanPoint,
              as: "contract_project_plan_points",
            },
            // ✅ Include costs di final fetch
            {
              model: models.db1.ContractProjectPlanCost,
              as: "contract_project_plan_costs",
            },
          ],
        });

        return finalRecords.map((r) => r.toJSON());
      }
    } catch (error) {
      console.error(
        `❌ Error syncing Contract Project Plans for ContractService ID ${idContractService}:`,
        error.message,
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(
        `Failed to sync Contract Project Plans: ${error.message}`,
      );
    }
  }

  /**
   * Start a contract project plan — fills realization_start_date and id_user_started.
   * Also updates ContractService status to "processed".
   *
   * @param {Number} id - ContractProjectPlan ID
   * @param {Number} idUserStarted - User ID who starts the plan
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated contract project plan
   */
  async startService(id, idUserStarted, isDoubleDatabase = true) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();
      } else {
        transaction1 = await db1.transaction();
      }

      // 1. Fetch the plan to get id_contract_service
      const plan = await this.Model1.findByPk(id, {
        transaction: transaction1,
      });

      if (!plan) {
        throw new Error(`Contract Project Plan with ID ${id} not found`);
      }

      if (plan.realization_start_date) {
        throw new Error(
          `Contract Project Plan with ID ${id} has already been started`,
        );
      }

      const now = new Date();
      const updateData = {
        realization_start_date: now,
        id_user_started: idUserStarted,
      };

      // 2. Update the plan
      await this.Model1.update(updateData, {
        where: { id },
        transaction: transaction1,
      });

      if (isDoubleDatabase) {
        await this.Model2.update(updateData, {
          where: { id },
          transaction: transaction2,
        });
      }

      console.log(`✅ Started Contract Project Plan ID ${id}`);

      // 3. Update ContractService status to "processed"
      await models.db1.ContractService.update(
        { status: "processed" },
        {
          where: { id: plan.id_contract_service },
          transaction: transaction1,
        },
      );

      if (isDoubleDatabase) {
        await models.db2.ContractService.update(
          { status: "processed" },
          {
            where: { id: plan.id_contract_service },
            transaction: transaction2,
          },
        );
      }

      console.log(
        `✅ Updated ContractService ID ${plan.id_contract_service} status to "processed"`,
      );

      if (isDoubleDatabase) {
        await transaction1.commit();
        await transaction2.commit();
      } else {
        await transaction1.commit();
      }

      // Return updated plan
      return await this.getById(id, {}, isDoubleDatabase);
    } catch (error) {
      console.error(
        `❌ Error starting Contract Project Plan ID ${id}:`,
        error.message,
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(
        `Failed to start Contract Project Plan: ${error.message}`,
      );
    }
  }

  /**
   * Stop a contract project plan — fills realization_end_date, id_user_stopped,
   * and auto-calculates realization_duration in days.
   * If this is the last active plan under the ContractService, updates its status to "done".
   *
   * @param {Number} id - ContractProjectPlan ID
   * @param {Number} idUserStopped - User ID who stops the plan
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated contract project plan
   */
  async stopService(id, idUserStopped, isDoubleDatabase = true) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();
      } else {
        transaction1 = await db1.transaction();
      }

      // 1. Fetch the plan
      const plan = await this.Model1.findByPk(id, {
        transaction: transaction1,
      });

      if (!plan) {
        throw new Error(`Contract Project Plan with ID ${id} not found`);
      }

      if (!plan.realization_start_date) {
        throw new Error(
          `Contract Project Plan with ID ${id} has not been started yet`,
        );
      }

      if (plan.realization_end_date) {
        throw new Error(
          `Contract Project Plan with ID ${id} has already been stopped`,
        );
      }

      const now = new Date();

      // 2. Calculate realization_duration in days (rounded up)
      const startDate = new Date(plan.realization_start_date);
      const diffMs = now - startDate;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      const updateData = {
        realization_end_date: now,
        id_user_stopped: idUserStopped,
        realization_duration: diffDays,
      };

      // 3. Update the plan
      await this.Model1.update(updateData, {
        where: { id },
        transaction: transaction1,
      });

      if (isDoubleDatabase) {
        await this.Model2.update(updateData, {
          where: { id },
          transaction: transaction2,
        });
      }

      console.log(
        `✅ Stopped Contract Project Plan ID ${id}, duration: ${diffDays} day(s)`,
      );

      // 4. Check if all plans under this ContractService are done
      const remainingActivePlans = await this.Model1.count({
        where: {
          id_contract_service: plan.id_contract_service,
          realization_end_date: null,
          id: { [require("sequelize").Op.ne]: id }, // exclude the one we just stopped
        },
        transaction: transaction1,
      });

      if (remainingActivePlans === 0) {
        // All plans are done — update ContractService status to "done"
        await models.db1.ContractService.update(
          { status: "done" },
          {
            where: { id: plan.id_contract_service },
            transaction: transaction1,
          },
        );

        if (isDoubleDatabase) {
          await models.db2.ContractService.update(
            { status: "done" },
            {
              where: { id: plan.id_contract_service },
              transaction: transaction2,
            },
          );
        }

        console.log(
          `✅ All plans done — Updated ContractService ID ${plan.id_contract_service} status to "done"`,
        );
      } else {
        console.log(
          `ℹ️ ${remainingActivePlans} plan(s) still active under ContractService ID ${plan.id_contract_service}`,
        );
      }

      if (isDoubleDatabase) {
        await transaction1.commit();
        await transaction2.commit();
      } else {
        await transaction1.commit();
      }

      // Return updated plan
      return await this.getById(id, {}, isDoubleDatabase);
    } catch (error) {
      console.error(
        `❌ Error stopping Contract Project Plan ID ${id}:`,
        error.message,
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(`Failed to stop Contract Project Plan: ${error.message}`);
    }
  }

  /**
   * Fill contract project plan point — updates is_checked, remarks, and file by point ID.
   *
   * @param {Number} pointId - ContractProjectPlanPoint ID
   * @param {Object} data - { is_checked, remarks, file, id_user }
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated point
   */
  async inputContractProjectPlan(pointId, data = {}, isDoubleDatabase = true) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();
      } else {
        transaction1 = await db1.transaction();
      }

      // 1. Fetch the point to verify it exists
      const point = await models.db1.ContractProjectPlanPoint.findByPk(
        pointId,
        { transaction: transaction1 },
      );

      if (!point) {
        throw new Error(
          `Contract Project Plan Point with ID ${pointId} not found`,
        );
      }

      const updateData = {};
      if (data.is_checked !== undefined)
        updateData.is_checked = data.is_checked;
      if (data.remarks !== undefined) updateData.remarks = data.remarks;
      if (data.file !== undefined) updateData.file = data.file;
      if (data.id_user !== undefined) updateData.id_user = data.id_user;

      // 2. Update in DB1
      await models.db1.ContractProjectPlanPoint.update(updateData, {
        where: { id: pointId },
        transaction: transaction1,
      });

      // 3. Update in DB2 if double database
      if (isDoubleDatabase) {
        await models.db2.ContractProjectPlanPoint.update(updateData, {
          where: { id: pointId },
          transaction: transaction2,
        });
      }

      console.log(`✅ Updated Contract Project Plan Point ID ${pointId}`);

      if (isDoubleDatabase) {
        await transaction1.commit();
        await transaction2.commit();
      } else {
        await transaction1.commit();
      }

      // Return updated point
      const updatedPoint =
        await models.db1.ContractProjectPlanPoint.findByPk(pointId);
      return updatedPoint ? updatedPoint.toJSON() : null;
    } catch (error) {
      console.error(
        `❌ Error updating Contract Project Plan Point ID ${pointId}:`,
        error.message,
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(
        `Failed to update Contract Project Plan Point: ${error.message}`,
      );
    }
  }

  /**
   * Fill contract project plan cost — updates is_checked, remarks, and file by cost ID.
   *
   * @param {Number} costId - ContractProjectPlanCost ID
   * @param {Object} data - { is_checked, remarks, file, id_user }
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated cost
   */
  async inputContractProjectPlanCost(
    costId,
    data = {},
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();
      } else {
        transaction1 = await db1.transaction();
      }

      // 1. Fetch the cost to verify it exists
      const cost = await models.db1.ContractProjectPlanCost.findByPk(costId, {
        transaction: transaction1,
      });

      if (!cost) {
        throw new Error(
          `Contract Project Plan Cost with ID ${costId} not found`,
        );
      }

      const updateData = {};
      if (data.is_checked !== undefined)
        updateData.is_checked = data.is_checked;
      if (data.remarks !== undefined) updateData.remarks = data.remarks;
      if (data.file !== undefined) updateData.file = data.file;
      if (data.id_user !== undefined) updateData.id_user = data.id_user;

      // 2. Update in DB1
      await models.db1.ContractProjectPlanCost.update(updateData, {
        where: { id: costId },
        transaction: transaction1,
      });

      // 3. Update in DB2 if double database
      if (isDoubleDatabase) {
        await models.db2.ContractProjectPlanCost.update(updateData, {
          where: { id: costId },
          transaction: transaction2,
        });
      }

      console.log(`✅ Updated Contract Project Plan Cost ID ${costId}`);

      if (isDoubleDatabase) {
        await transaction1.commit();
        await transaction2.commit();
      } else {
        await transaction1.commit();
      }

      // Return updated cost
      const updatedCost =
        await models.db1.ContractProjectPlanCost.findByPk(costId);
      return updatedCost ? updatedCost.toJSON() : null;
    } catch (error) {
      console.error(
        `❌ Error updating Contract Project Plan Cost ID ${costId}:`,
        error.message,
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(
        `Failed to update Contract Project Plan Point: ${error.message}`,
      );
    }
  }
}

module.exports = new ContractProjectPlanService();
