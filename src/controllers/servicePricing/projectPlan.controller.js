const projectPlanService = require("../../services/servicePricing/projectPlan.service");
const { successResponse, errorResponse } = require("../../utils/response");
const { Op } = require("sequelize");

class ProjectPlanController {
  /**
   * Get all project plans
   */
  async getAll(req, res) {
    try {
      const {
        is_double_database = true,
        id_service_pricing,
        search,
        page,
        limit,
      } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      let obj = {};
      if (search) {
        obj = {
          [Op.or]: [
            { activity_name_indo: { [Op.like]: `%${search}%` } },
            { activity_name_mandarin: { [Op.like]: `%${search}%` } },
          ],
        };
      }
      if (id_service_pricing) obj.id_service_pricing = id_service_pricing;

      const projectPlans = await projectPlanService.getAllWithRelations(
        { where: obj },
        parseInt(page),
        parseInt(limit),
        isDoubleDatabase,
      );

      return successResponse(
        res,
        projectPlans,
        "Project plans retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get project plan by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const projectPlan = await projectPlanService.getById(
        id,
        {},
        isDoubleDatabase,
      );

      if (!projectPlan) {
        return errorResponse(res, "Project plan not found", 404);
      }

      return successResponse(
        res,
        projectPlan,
        "Project plan retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create multiple project plans with points
   * Each item in project_plan_list can contain an array of project_plan_points.
   * Request body:
   * {
   *   "is_double_database": true,
   *   "project_plan_list": [
   *     {
   *       "id_service_pricing": 1,
   *       "activity_name_indo": "...",
   *       "activity_name_mandarin": "...",
   *       "duration": 5,
   *       "is_active": true,
   *       "project_plan_points": [
   *         {
   *           "activity_name_indo": "...",
   *           "activity_name_mandarin": "...",
   *           "duration": 2,
   *           "is_active": true
   *         }
   *       ]
   *     }
   *   ]
   * }
   */
  async create(req, res) {
    try {
      const { is_double_database, project_plan_list } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      if (!project_plan_list || !Array.isArray(project_plan_list)) {
        return errorResponse(res, "project_plan_list must be an array", 400);
      }

      if (project_plan_list.length === 0) {
        return errorResponse(res, "project_plan_list cannot be empty", 400);
      }

      for (let i = 0; i < project_plan_list.length; i++) {
        const item = project_plan_list[i];

        if (!item.id_service_pricing) {
          return errorResponse(
            res,
            `id_service_pricing is required for item at index ${i}`,
            400,
          );
        }

        if (!item.activity_name_indo) {
          return errorResponse(
            res,
            `activity_name_indo is required for item at index ${i}`,
            400,
          );
        }

        if (!item.activity_name_mandarin) {
          return errorResponse(
            res,
            `activity_name_mandarin is required for item at index ${i}`,
            400,
          );
        }

        if (item.duration === undefined || item.duration === null) {
          return errorResponse(
            res,
            `duration is required for item at index ${i}`,
            400,
          );
        }

        if (
          item.project_plan_points &&
          !Array.isArray(item.project_plan_points)
        ) {
          return errorResponse(
            res,
            `project_plan_points must be an array for item at index ${i}`,
            400,
          );
        }

        if (item.project_plan_points) {
          for (let j = 0; j < item.project_plan_points.length; j++) {
            const point = item.project_plan_points[j];

            if (!point.file_description_indo) {
              return errorResponse(
                res,
                `file_description_indo is required for project_plan_points at index ${j} in item ${i}`,
                400,
              );
            }

            if (!point.file_description_mandarin) {
              return errorResponse(
                res,
                `file_description_mandarin is required for project_plan_points at index ${j} in item ${i}`,
                400,
              );
            }
          }
        }
      }

      const projectPlanDataList = project_plan_list.map((item) => ({
        ...item,
        is_active: item.is_active !== undefined ? item.is_active : true,
        project_plan_points: (item.project_plan_points || []).map((point) => ({
          ...point,
          is_active: point.is_active !== undefined ? point.is_active : true,
        })),
      }));

      const result = await projectPlanService.createMultipleWithPoints(
        projectPlanDataList,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        result,
        "Project plans created successfully",
        201,
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Sync all project plans by id_service_pricing in a single transaction.
   * Plans with id -> update, without id -> create, missing from list -> delete.
   * Same logic applies to project_plan_points inside each plan.
   * Route: PUT /project-plans/sync/:id_service_pricing
   * Request body:
   * {
   *   "is_double_database": true,
   *   "project_plan_list": [
   *     {
   *       "id": 1,                           <- ada id = update
   *       "activity_name_indo": "...",
   *       "activity_name_mandarin": "...",
   *       "duration": 5,
   *       "project_plan_points": [
   *         { "id": 10, "activity_name_indo": "...", "activity_name_mandarin": "...", "duration": 2 },
   *         { "activity_name_indo": "baru", "activity_name_mandarin": "new", "duration": 1 }
   *       ]
   *     },
   *     {
   *       "activity_name_indo": "...",        <- tidak ada id = create baru
   *       "activity_name_mandarin": "...",
   *       "duration": 3,
   *       "project_plan_points": []
   *     }
   *   ]
   * }
   */
  async update(req, res) {
    try {
      const { id_service_pricing } = req.params;
      const { is_double_database, project_plan_list } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      if (!project_plan_list || !Array.isArray(project_plan_list)) {
        return errorResponse(res, "project_plan_list must be an array", 400);
      }

      for (let i = 0; i < project_plan_list.length; i++) {
        const item = project_plan_list[i];

        if (!item.activity_name_indo) {
          return errorResponse(
            res,
            `activity_name_indo is required for item at index ${i}`,
            400,
          );
        }

        if (!item.activity_name_mandarin) {
          return errorResponse(
            res,
            `activity_name_mandarin is required for item at index ${i}`,
            400,
          );
        }

        if (item.duration === undefined || item.duration === null) {
          return errorResponse(
            res,
            `duration is required for item at index ${i}`,
            400,
          );
        }

        if (
          item.project_plan_points &&
          !Array.isArray(item.project_plan_points)
        ) {
          return errorResponse(
            res,
            `project_plan_points must be an array for item at index ${i}`,
            400,
          );
        }

        if (item.project_plan_points) {
          for (let j = 0; j < item.project_plan_points.length; j++) {
            const point = item.project_plan_points[j];

            if (!point.activity_name_indo) {
              return errorResponse(
                res,
                `activity_name_indo is required for project_plan_points at index ${j} in item ${i}`,
                400,
              );
            }

            if (!point.activity_name_mandarin) {
              return errorResponse(
                res,
                `activity_name_mandarin is required for project_plan_points at index ${j} in item ${i}`,
                400,
              );
            }

            if (point.duration === undefined || point.duration === null) {
              return errorResponse(
                res,
                `duration is required for project_plan_points at index ${j} in item ${i}`,
                400,
              );
            }
          }
        }
      }

      const result = await projectPlanService.syncByServicePricing(
        id_service_pricing,
        project_plan_list,
        isDoubleDatabase,
      );

      return successResponse(res, result, "Project plans synced successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete project plan
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const existing = await projectPlanService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Project plan not found", 404);
      }

      await projectPlanService.delete(id, isDoubleDatabase);

      return successResponse(res, null, "Project plan deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new ProjectPlanController();
