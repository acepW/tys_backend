const DualDatabaseService = require("../dualDatabase.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");

class ProjectPlanService extends DualDatabaseService {
  constructor() {
    super("ProjectPlan");
  }

  /**
   * Get all project plans with relations
   * @param {Object} options - Query options
   * @param {Number} page
   * @param {Number} limit
   * @param {Boolean} isDoubleDatabase
   * @returns {Array|Object} Project plans with relations
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
          model: dbModels.ProjectPlanPoint,
          as: "project_plan_points",
          separate: true,
          attributes: [
            "id",
            "file_description_indo",
            "file_description_mandarin",
            "is_active",
          ],
        },
        {
          model: dbModels.ServicePricing,
          as: "service_pricing",
          attributes: ["id", "product_name_indo", "product_name_mandarin"],
        },
      ],
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
   * Get project plan by ID with relations
   * @param {Number} id
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Project plan with relations
   */
  async getById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.ProjectPlanPoint,
          as: "project_plan_points",
          attributes: [
            "id",
            "file_description_indo",
            "file_description_mandarin",
            "is_active",
          ],
        },
        {
          model: dbModels.ServicePricing,
          as: "service_pricing",
          attributes: ["id", "product_name_indo", "product_name_mandarin"],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Create multiple project plans with project plan points in a single transaction
   *
   * @param {Array} projectPlanDataList - Array of project plan data with points
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Array} Created project plans with points
   */
  async createMultipleWithPoints(
    projectPlanDataList = [],
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Creating ${projectPlanDataList.length} Project Plan records with points in both databases...`,
        );

        const results = [];

        for (const item of projectPlanDataList) {
          const { project_plan_points = [], ...projectPlanData } = item;

          // 1. Create Project Plan in DB1
          const projectPlan1 = await this.Model1.create(projectPlanData, {
            transaction: transaction1,
          });
          console.log(
            `✅ Created Project Plan in DB1 with ID: ${projectPlan1.id}`,
          );

          // 2. Create Project Plan in DB2 with same ID
          const projectPlanDataWithId = {
            ...projectPlanData,
            id: projectPlan1.id,
          };
          await this.Model2.create(projectPlanDataWithId, {
            transaction: transaction2,
          });
          console.log(
            `✅ Created Project Plan in DB2 with ID: ${projectPlan1.id}`,
          );

          // 3. Prepare points data with foreign key
          const pointsData = project_plan_points.map((point) => ({
            ...point,
            id_project_plan: projectPlan1.id,
          }));

          // 4. Sync Project Plan Points
          const pointsResult = await syncChildRecords({
            Model1: models.db1.ProjectPlanPoint,
            Model2: models.db2.ProjectPlanPoint,
            foreignKey: "id_project_plan",
            parentId: projectPlan1.id,
            newData: pointsData,
            transaction1,
            transaction2,
            isDoubleDatabase,
          });

          results.push({
            project_plan: projectPlan1.toJSON(),
            project_plan_points: pointsResult,
          });
        }

        await transaction1.commit();
        await transaction2.commit();
        console.log(
          `✅ ${projectPlanDataList.length} Project Plan records with points successfully created`,
        );

        return results;
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const results = [];

        for (const item of projectPlanDataList) {
          const { project_plan_points = [], ...projectPlanData } = item;

          const projectPlan = await this.Model1.create(projectPlanData, {
            transaction: transaction1,
          });

          const pointsData = project_plan_points.map((point) => ({
            ...point,
            id_project_plan: projectPlan.id,
          }));

          const pointsResult = await syncChildRecords({
            Model1: models.db1.ProjectPlanPoint,
            Model2: null,
            foreignKey: "id_project_plan",
            parentId: projectPlan.id,
            newData: pointsData,
            transaction1,
            transaction2: null,
            isDoubleDatabase: false,
          });

          results.push({
            project_plan: projectPlan.toJSON(),
            project_plan_points: pointsResult,
          });
        }

        await transaction1.commit();
        console.log(
          `✅ ${projectPlanDataList.length} Project Plan records created in DB1 only`,
        );

        return results;
      }
    } catch (error) {
      console.error(
        `❌ Error creating Project Plan with points:`,
        error.message,
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(
        `Failed to create Project Plan with points: ${error.message}`,
      );
    }
  }

  /**
   * Sync all project plans (and their points) by id_service_pricing in a single transaction.
   * Project plans with id → update, without id → create, missing from list → delete.
   * Same logic applies recursively to project_plan_points inside each plan.
   *
   * @param {Number} idServicePricing - Service Pricing ID
   * @param {Array} projectPlanDataList - Array of project plan data with points
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Array} Final state of all project plans under this service pricing
   */
  async syncByServicePricing(
    idServicePricing,
    projectPlanDataList = [],
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Syncing Project Plans for ServicePricing ID ${idServicePricing} in both databases...`,
        );

        // 1. Fetch existing project plan IDs for this service pricing
        const existingPlans = await this.Model1.findAll({
          where: { id_service_pricing: idServicePricing },
          attributes: ["id"],
          transaction: transaction1,
        });
        const existingIds = existingPlans.map((p) => p.id);

        // Determine incoming IDs (only those that already exist)
        const incomingIds = projectPlanDataList
          .filter((item) => item.id)
          .map((item) => item.id);

        // IDs to delete = existing but not in incoming list
        const idsToDelete = existingIds.filter(
          (id) => !incomingIds.includes(id),
        );

        // 2. Delete removed project plans (and their points via cascade/manual)
        if (idsToDelete.length > 0) {
          // Delete points first
          await models.db1.ProjectPlanPoint.destroy({
            where: { id_project_plan: idsToDelete },
            transaction: transaction1,
          });
          await models.db2.ProjectPlanPoint.destroy({
            where: { id_project_plan: idsToDelete },
            transaction: transaction2,
          });

          // Delete plans
          await this.Model1.destroy({
            where: { id: idsToDelete },
            transaction: transaction1,
          });
          await this.Model2.destroy({
            where: { id: idsToDelete },
            transaction: transaction2,
          });

          console.log(`🗑️ Deleted Project Plan IDs: ${idsToDelete.join(", ")}`);
        }

        const results = [];

        // 3. Loop through incoming list: update or create
        for (const item of projectPlanDataList) {
          const { id, project_plan_points = [], ...projectPlanData } = item;

          // Ensure foreign key is set
          projectPlanData.id_service_pricing = idServicePricing;

          let planId;

          if (id && existingIds.includes(id)) {
            // UPDATE existing plan
            await this.Model1.update(projectPlanData, {
              where: { id },
              transaction: transaction1,
            });
            await this.Model2.update(projectPlanData, {
              where: { id },
              transaction: transaction2,
            });
            planId = id;
            console.log(`✅ Updated Project Plan ID ${planId}`);
          } else {
            // CREATE new plan
            const newPlan = await this.Model1.create(projectPlanData, {
              transaction: transaction1,
            });
            await this.Model2.create(
              { ...projectPlanData, id: newPlan.id },
              { transaction: transaction2 },
            );
            planId = newPlan.id;
            console.log(`✅ Created Project Plan ID ${planId}`);
          }

          // 4. Sync points for this plan
          const pointsWithFk = project_plan_points.map((point) => ({
            ...point,
            id_project_plan: planId,
          }));

          await syncChildRecords({
            Model1: models.db1.ProjectPlanPoint,
            Model2: models.db2.ProjectPlanPoint,
            foreignKey: "id_project_plan",
            parentId: planId,
            newData: pointsWithFk,
            transaction1,
            transaction2,
            isDoubleDatabase,
          });

          results.push(planId);
        }

        await transaction1.commit();
        await transaction2.commit();
        console.log(
          `✅ Project Plans synced for ServicePricing ID ${idServicePricing}`,
        );

        // Fetch and return final state
        const finalRecords = await this.Model1.findAll({
          where: { id_service_pricing: idServicePricing },
          include: [
            {
              model: models.db1.ProjectPlanPoint,
              as: "project_plan_points",
            },
          ],
        });

        return finalRecords.map((r) => r.toJSON());
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        console.log(
          `🔄 Syncing Project Plans for ServicePricing ID ${idServicePricing} in DB1...`,
        );

        const existingPlans = await this.Model1.findAll({
          where: { id_service_pricing: idServicePricing },
          attributes: ["id"],
          transaction: transaction1,
        });
        const existingIds = existingPlans.map((p) => p.id);

        const incomingIds = projectPlanDataList
          .filter((item) => item.id)
          .map((item) => item.id);

        const idsToDelete = existingIds.filter(
          (id) => !incomingIds.includes(id),
        );

        if (idsToDelete.length > 0) {
          await models.db1.ProjectPlanPoint.destroy({
            where: { id_project_plan: idsToDelete },
            transaction: transaction1,
          });
          await this.Model1.destroy({
            where: { id: idsToDelete },
            transaction: transaction1,
          });
          console.log(`🗑️ Deleted Project Plan IDs: ${idsToDelete.join(", ")}`);
        }

        for (const item of projectPlanDataList) {
          const { id, project_plan_points = [], ...projectPlanData } = item;

          projectPlanData.id_service_pricing = idServicePricing;

          let planId;

          if (id && existingIds.includes(id)) {
            await this.Model1.update(projectPlanData, {
              where: { id },
              transaction: transaction1,
            });
            planId = id;
            console.log(`✅ Updated Project Plan ID ${planId}`);
          } else {
            const newPlan = await this.Model1.create(projectPlanData, {
              transaction: transaction1,
            });
            planId = newPlan.id;
            console.log(`✅ Created Project Plan ID ${planId}`);
          }

          const pointsWithFk = project_plan_points.map((point) => ({
            ...point,
            id_project_plan: planId,
          }));

          await syncChildRecords({
            Model1: models.db1.ProjectPlanPoint,
            Model2: null,
            foreignKey: "id_project_plan",
            parentId: planId,
            newData: pointsWithFk,
            transaction1,
            transaction2: null,
            isDoubleDatabase: false,
          });
        }

        await transaction1.commit();
        console.log(
          `✅ Project Plans synced for ServicePricing ID ${idServicePricing} in DB1`,
        );

        const finalRecords = await this.Model1.findAll({
          where: { id_service_pricing: idServicePricing },
          include: [
            {
              model: models.db1.ProjectPlanPoint,
              as: "project_plan_points",
            },
          ],
        });

        return finalRecords.map((r) => r.toJSON());
      }
    } catch (error) {
      console.error(
        `❌ Error syncing Project Plans for ServicePricing ID ${idServicePricing}:`,
        error.message,
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(`Failed to sync Project Plans: ${error.message}`);
    }
  }
}

module.exports = new ProjectPlanService();
