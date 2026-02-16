const clauseService = require("../services/masterClause/clause.service");
const { successResponse, errorResponse } = require("../utils/response");
const { Op } = require("sequelize");

class ClauseController {
  /**
   * Get all clauses with clause points
   */
  async getAll(req, res) {
    try {
      const { is_double_database, search, is_active } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      let obj = {};

      if (search) {
        obj = {
          [Op.or]: [
            { description_indo: { [Op.like]: `%${search}%` } },
            { description_mandarin: { [Op.like]: `%${search}%` } },
          ],
        };
      }

      if (is_active !== undefined) {
        obj.is_active = is_active === "true";
      }

      const clauses = await clauseService.getAllWithRelations(
        { where: obj },
        isDoubleDatabase
      );

      return successResponse(res, clauses, "Clauses retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get clause by ID with clause points
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const clause = await clauseService.getById(id, {}, isDoubleDatabase);

      if (!clause) {
        return errorResponse(res, "Clause not found", 404);
      }

      return successResponse(res, clause, "Clause retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create or Update multiple clauses with clause points
   *
   * Request Body Structure:
   * {
   *   "is_double_database": true,
   *   "clause_list": [
   *     {
   *       "id": null, // null = CREATE, number = UPDATE
   *       "description_indo": "Pasal 1",
   *       "description_mandarin": "第一条",
   *       "is_active": true,
   *       "clause_points": [
   *         {
   *           "id": null, // null = CREATE, number = UPDATE
   *           "description_indo": "Point 1.1",
   *           "description_mandarin": "第1.1点",
   *           "is_active": true
   *         }
   *       ]
   *     }
   *   ]
   * }
   *
   * Logic:
   * - If clause.id is null => CREATE new clause
   * - If clause.id exists => UPDATE existing clause
   * - If clause_point.id is null => CREATE new clause point
   * - If clause_point.id exists => UPDATE existing clause point
   * - If existing clause_point is not in the list => DELETE clause point
   */
  async createUpdate(req, res) {
    try {
      const { is_double_database, clause_list } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Validation
      if (!clause_list || !Array.isArray(clause_list)) {
        return errorResponse(res, "clause_list must be an array", 400);
      }

      if (clause_list.length === 0) {
        return errorResponse(res, "clause_list cannot be empty", 400);
      }

      // Validate each clause item
      for (let i = 0; i < clause_list.length; i++) {
        const item = clause_list[i];

        if (!item.description_indo) {
          return errorResponse(
            res,
            `description_indo is required for clause at index ${i}`,
            400
          );
        }

        if (!item.description_mandarin) {
          return errorResponse(
            res,
            `description_mandarin is required for clause at index ${i}`,
            400
          );
        }

        // Ensure clause_points is an array
        if (item.clause_points && !Array.isArray(item.clause_points)) {
          return errorResponse(
            res,
            `clause_points must be an array for clause at index ${i}`,
            400
          );
        }

        // Validate each clause point
        if (item.clause_points && item.clause_points.length > 0) {
          for (let j = 0; j < item.clause_points.length; j++) {
            const point = item.clause_points[j];

            if (!point.description_indo) {
              return errorResponse(
                res,
                `description_indo is required for clause_point at clause index ${i}, point index ${j}`,
                400
              );
            }

            if (!point.description_mandarin) {
              return errorResponse(
                res,
                `description_mandarin is required for clause_point at clause index ${i}, point index ${j}`,
                400
              );
            }
          }
        }
      }

      // Prepare data with is_active default
      const clauseDataList = clause_list.map((item) => ({
        ...item,
        is_active: item.is_active !== undefined ? item.is_active : true,
        clause_points: (item.clause_points || []).map((point) => ({
          ...point,
          is_active: point.is_active !== undefined ? point.is_active : true,
        })),
      }));

      const result = await clauseService.upsertMultipleWithClausePoints(
        clauseDataList,
        isDoubleDatabase
      );

      // Count operations
      const created = result.filter((r) => r.operation === "created").length;
      const updated = result.filter((r) => r.operation === "updated").length;

      return successResponse(
        res,
        result,
        `Clauses processed successfully (${created} created, ${updated} updated)`,
        201
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete clause (will cascade to clause points)
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      // Check if clause exists
      const existing = await clauseService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Clause not found", 404);
      }

      const result = await clauseService.deleteClause(id, isDoubleDatabase);

      return successResponse(res, result, "Clause deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Toggle clause active status
   */
  async toggleActive(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if clause exists
      const existing = await clauseService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Clause not found", 404);
      }

      const result = await clauseService.update(
        id,
        { is_active: !existing.is_active },
        isDoubleDatabase
      );

      return successResponse(
        res,
        result,
        `Clause ${
          existing.is_active ? "deactivated" : "activated"
        } successfully`
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new ClauseController();
