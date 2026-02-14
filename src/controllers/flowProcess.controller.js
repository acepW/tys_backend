const flowProcessService = require("../services/masterFlowProcess/flowProcess.service");
const { successResponse, errorResponse } = require("../utils/response");
const { Op } = require("sequelize");

class FlowProcessController {
  /**
   * Get all flow processes
   */
  async getAll(req, res) {
    try {
      const { is_double_database, id_category, is_active, search } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      let obj = {};
      if (search) {
        obj = {
          [Op.or]: [
            { project_name_indo: { [Op.like]: `%${search}%` } },
            { project_name_mandarin: { [Op.like]: `%${search}%` } },
          ],
        };
      }
      if (id_category) obj.id_category = id_category;
      if (is_active !== undefined) obj.is_active = is_active === "true";

      const flowProcesses = await flowProcessService.getAllWithRelations(
        { where: obj },
        isDoubleDatabase
      );

      return successResponse(
        res,
        flowProcesses,
        "Flow processes retrieved successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get active flow processes
   */
  async getActive(req, res) {
    try {
      const isDoubleDatabase = req.query.is_double_database !== "false";
      const flowProcesses = await flowProcessService.getActiveFlowProcesses(
        isDoubleDatabase
      );

      return successResponse(
        res,
        flowProcesses,
        "Active flow processes retrieved successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get flow process by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const flowProcess = await flowProcessService.getById(
        id,
        {},
        isDoubleDatabase
      );

      if (!flowProcess) {
        return errorResponse(res, "Flow process not found", 404);
      }

      return successResponse(
        res,
        flowProcess,
        "Flow process retrieved successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get flow processes by category
   */
  async getByCategory(req, res) {
    try {
      const { categoryId } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      const flowProcesses = await flowProcessService.getByCategory(
        categoryId,
        isDoubleDatabase
      );

      return successResponse(
        res,
        flowProcesses,
        "Flow processes retrieved successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get active flow processes by category
   */
  async getActiveByCategoryId(req, res) {
    try {
      const { categoryId } = req.params;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      const flowProcesses = await flowProcessService.getActiveByCategoryId(
        categoryId,
        isDoubleDatabase
      );

      return successResponse(
        res,
        flowProcesses,
        "Active flow processes retrieved successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Search flow processes
   */
  async search(req, res) {
    try {
      const { query } = req.query;
      const isDoubleDatabase = req.query.is_double_database !== "false";

      if (!query) {
        return errorResponse(res, "Search query is required", 400);
      }

      const flowProcesses = await flowProcessService.searchByProjectName(
        query,
        isDoubleDatabase
      );

      return successResponse(
        res,
        flowProcesses,
        "Flow processes found successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create multiple flow processes
   */
  async create(req, res) {
    try {
      const { is_double_database, flow_process_list } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Validation
      if (!flow_process_list || !Array.isArray(flow_process_list)) {
        return errorResponse(res, "flow_process_list must be an array", 400);
      }

      if (flow_process_list.length === 0) {
        return errorResponse(res, "flow_process_list cannot be empty", 400);
      }

      // Validate each flow process item
      for (let i = 0; i < flow_process_list.length; i++) {
        const item = flow_process_list[i];

        if (!item.id_category) {
          return errorResponse(
            res,
            `id_category is required for item at index ${i}`,
            400
          );
        }

        if (!item.project_name_indo) {
          return errorResponse(
            res,
            `project_name_indo is required for item at index ${i}`,
            400
          );
        }

        if (!item.project_name_mandarin) {
          return errorResponse(
            res,
            `project_name_mandarin is required for item at index ${i}`,
            400
          );
        }

        if (!item.document_description) {
          return errorResponse(
            res,
            `document_description is required for item at index ${i}`,
            400
          );
        }
      }

      // Prepare data with is_active default
      const flowProcessDataList = flow_process_list.map((item) => ({
        ...item,
        is_active: item.is_active !== undefined ? item.is_active : true,
      }));

      const result = await flowProcessService.createMultiple(
        flowProcessDataList,
        isDoubleDatabase
      );

      return successResponse(
        res,
        result,
        "Flow processes created successfully",
        201
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update single or multiple flow processes
   */
  async update(req, res) {
    try {
      const { categoryId } = req.params;
      const { is_double_database, flow_process_list } = req.body;
      const isDoubleDatabase = is_double_database !== false;
      console.log(categoryId);

      const flowProcess = await flowProcessService.updateMultiple(
        categoryId,
        flow_process_list,
        isDoubleDatabase
      );

      return successResponse(
        res,
        flowProcess,
        "Flow process updated successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Sync flow processes by category (Create/Update/Delete)
   * Similar to syncChildRecords pattern
   *
   * Rules:
   * - If id is null/undefined: CREATE new record
   * - If id exists in request: UPDATE existing record
   * - If record exists in DB but not in request: DELETE record
   */
  async syncByCategory(req, res) {
    try {
      const { categoryId } = req.params;
      const { is_double_database, flow_process_list } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Validation
      if (!categoryId) {
        return errorResponse(res, "Category ID is required", 400);
      }

      if (!flow_process_list || !Array.isArray(flow_process_list)) {
        return errorResponse(res, "flow_process_list must be an array", 400);
      }

      // Check if category exists
      const categoryExists = await flowProcessService.checkCategoryExists(
        categoryId,
        isDoubleDatabase
      );

      if (!categoryExists) {
        return errorResponse(res, "Category not found", 404);
      }

      // Validate each item in the list
      for (let i = 0; i < flow_process_list.length; i++) {
        const item = flow_process_list[i];

        // For new records (without id), validate required fields
        if (!item.id) {
          if (!item.project_name_indo) {
            return errorResponse(
              res,
              `project_name_indo is required for new item at index ${i}`,
              400
            );
          }

          if (!item.project_name_mandarin) {
            return errorResponse(
              res,
              `project_name_mandarin is required for new item at index ${i}`,
              400
            );
          }

          if (!item.document_description) {
            return errorResponse(
              res,
              `document_description is required for new item at index ${i}`,
              400
            );
          }
        }
      }

      const result = await flowProcessService.syncFlowProcessesByCategory(
        categoryId,
        flow_process_list,
        isDoubleDatabase
      );

      return successResponse(res, result, "Flow processes synced successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete flow process
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      // Check if flow process exists
      const existing = await flowProcessService.findById(
        id,
        {},
        isDoubleDatabase
      );
      if (!existing) {
        return errorResponse(res, "Flow process not found", 404);
      }

      await flowProcessService.delete(id, isDoubleDatabase);

      return successResponse(res, null, "Flow process deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new FlowProcessController();
