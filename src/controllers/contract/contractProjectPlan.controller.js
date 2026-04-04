const contractProjectPlanService = require("../../services/contract/contractProjectPlan.service");
const { successResponse, errorResponse } = require("../../utils/response");
const { Op } = require("sequelize");

class ContractProjectPlanController {
  /**
   * Get all contract project plans
   */
  async getAll(req, res) {
    try {
      const {
        is_double_database = true,
        id_contract_service,
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
      if (id_contract_service) obj.id_contract_service = id_contract_service;

      const contractProjectPlans =
        await contractProjectPlanService.getAllWithRelations(
          { where: obj },
          parseInt(page),
          parseInt(limit),
          isDoubleDatabase,
        );

      return successResponse(
        res,
        contractProjectPlans,
        "Contract project plans retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get contract project plan by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const contractProjectPlan = await contractProjectPlanService.getById(
        id,
        {},
        isDoubleDatabase,
      );

      if (!contractProjectPlan) {
        return errorResponse(res, "Contract project plan not found", 404);
      }

      return successResponse(
        res,
        contractProjectPlan,
        "Contract project plan retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  // Create multiple contract project plans with points
  // Request body:
  // {
  //   "is_double_database": true,
  //   "contract_project_plan_list": [
  //     {
  //       "id_contract_service": 1,
  //       "activity_name_indo": "...",
  //       "activity_name_mandarin": "...",
  //       "plan_start_date": "2024-01-01",
  //       "plan_end_date": "2024-01-10",
  //       "plan_duration": 10,
  //       "is_active": true,
  //       "project_plan_points": [
  //         {
  //           "file_description_indo": "...",
  //           "file_description_mandarin": "...",
  //           "is_active": true
  //         }
  //       ]
  //     }
  //   ]
  // }

  async create(req, res) {
    try {
      const { is_double_database, contract_project_plan_list } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      if (
        !contract_project_plan_list ||
        !Array.isArray(contract_project_plan_list)
      ) {
        return errorResponse(
          res,
          "contract_project_plan_list must be an array",
          400,
        );
      }

      if (contract_project_plan_list.length === 0) {
        return errorResponse(
          res,
          "contract_project_plan_list cannot be empty",
          400,
        );
      }

      for (let i = 0; i < contract_project_plan_list.length; i++) {
        const item = contract_project_plan_list[i];

        if (!item.id_contract_service) {
          return errorResponse(
            res,
            `id_contract_service is required for item at index ${i}`,
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

        if (!item.plan_start_date) {
          return errorResponse(
            res,
            `plan_start_date is required for item at index ${i}`,
            400,
          );
        }

        if (!item.plan_end_date) {
          return errorResponse(
            res,
            `plan_end_date is required for item at index ${i}`,
            400,
          );
        }

        if (item.plan_duration === undefined || item.plan_duration === null) {
          return errorResponse(
            res,
            `plan_duration is required for item at index ${i}`,
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

      const contractProjectPlanDataList = contract_project_plan_list.map(
        (item) => ({
          ...item,
          is_active: item.is_active !== undefined ? item.is_active : true,
          project_plan_points: (item.project_plan_points || []).map(
            (point) => ({
              ...point,
              is_active: point.is_active !== undefined ? point.is_active : true,
            }),
          ),
        }),
      );

      const result = await contractProjectPlanService.createMultipleWithPoints(
        contractProjectPlanDataList,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        result,
        "Contract project plans created successfully",
        201,
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Sync all contract project plans by id_contract_service in a single transaction.
   * Plans with id -> update, without id -> create, missing from list -> delete.
   * Route: PUT /contract-project-plans/sync/:id_contract_service
   * Request body:
   * {
   *   "is_double_database": true,
   *   "contract_project_plan_list": [
   *     {
   *       "id": 1,
   *       "activity_name_indo": "...",
   *       "activity_name_mandarin": "...",
   *       "plan_start_date": "2024-01-01",
   *       "plan_end_date": "2024-01-10",
   *       "plan_duration": 10,
   *       "project_plan_points": [
   *         { "id": 5, "file_description_indo": "...", "file_description_mandarin": "..." },
   *         { "file_description_indo": "baru", "file_description_mandarin": "new" }
   *       ]
   *     }
   *   ]
   * }
   */
  async update(req, res) {
    try {
      const { id_contract_service } = req.params;
      const { is_double_database, contract_project_plan_list } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      if (
        !contract_project_plan_list ||
        !Array.isArray(contract_project_plan_list)
      ) {
        return errorResponse(
          res,
          "contract_project_plan_list must be an array",
          400,
        );
      }

      for (let i = 0; i < contract_project_plan_list.length; i++) {
        const item = contract_project_plan_list[i];

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

        if (!item.plan_start_date) {
          return errorResponse(
            res,
            `plan_start_date is required for item at index ${i}`,
            400,
          );
        }

        if (!item.plan_end_date) {
          return errorResponse(
            res,
            `plan_end_date is required for item at index ${i}`,
            400,
          );
        }

        if (item.plan_duration === undefined || item.plan_duration === null) {
          return errorResponse(
            res,
            `plan_duration is required for item at index ${i}`,
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

      const result = await contractProjectPlanService.syncByContractService(
        id_contract_service,
        contract_project_plan_list,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        result,
        "Contract project plans synced successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Start a contract project plan — fills realization_start_date and id_user_started.
   * Also updates ContractService status to "progress".
   * Route: PATCH /contract-project-plans/:id/start
   * Request body:
   * {
   *   "is_double_database": true,
   *   "id_user_started": 1
   * }
   */
  async start(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;

      const result = await contractProjectPlanService.startService(
        id,
        req.user.id,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        result,
        "Contract project plan started successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Stop a contract project plan — fills realization_end_date, id_user_stopped,
   * and auto-calculates realization_duration.
   * If this is the last plan, ContractService status is updated to "done".
   * Route: PATCH /contract-project-plans/:id/stop
   * Request body:
   * {
   *   "is_double_database": true,
   *   "id_user_stopped": 2
   * }
   */
  async stop(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;

      const result = await contractProjectPlanService.stopService(
        id,
        req.user.id,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        result,
        "Contract project plan stopped successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  // Fill a contract project plan point — updates is_checked, remarks, and file.
  // Route: PATCH /contract-project-plans/points/:point_id/fill
  // Request body:
  // {
  //   "is_checked": true,
  //   "remarks": "Looks good",
  //   "file": "uploads/document.pdf"
  // }

  async inputContractProjectPlan(req, res) {
    try {
      const { point_id } = req.params;
      const { is_double_database = true, is_checked, remarks, file } = req.body;
      const isDoubleDatabase = is_double_database;

      if (
        is_checked === undefined &&
        remarks === undefined &&
        file === undefined
      ) {
        return errorResponse(
          res,
          "At least one of is_checked, remarks, or file is required",
          400,
        );
      }

      const result = await contractProjectPlanService.inputContractProjectPlan(
        point_id,
        { is_checked, remarks, file, id_user: req.user.id },
        isDoubleDatabase,
      );

      return successResponse(
        res,
        result,
        "Contract project plan point updated successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  // Fill a contract project plan cost — updates is_checked, remarks, and file.
  // Route: PATCH /contract-project-plans/costs/:cost_id/fill
  // Request body:
  // {
  //   "is_checked": true,
  //   "remarks": "Looks good",
  //   "file": "uploads/document.pdf"
  // }

  async inputContractProjectPlanCost(req, res) {
    try {
      const { cost_id } = req.params;
      const { is_double_database = true, is_checked, remarks, file } = req.body;
      const isDoubleDatabase = is_double_database;

      if (
        is_checked === undefined &&
        remarks === undefined &&
        file === undefined
      ) {
        return errorResponse(
          res,
          "At least one of is_checked, remarks, or file is required",
          400,
        );
      }

      const result =
        await contractProjectPlanService.inputContractProjectPlanCost(
          cost_id,
          { is_checked, remarks, file, id_user: req.user.id },
          isDoubleDatabase,
        );

      return successResponse(
        res,
        result,
        "Contract project plan cost updated successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete contract project plan
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const existing = await contractProjectPlanService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Contract project plan not found", 404);
      }

      await contractProjectPlanService.delete(id, isDoubleDatabase);

      return successResponse(
        res,
        null,
        "Contract project plan deleted successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new ContractProjectPlanController();
