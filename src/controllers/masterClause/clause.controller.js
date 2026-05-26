const clauseTemplateService = require("../../services/masterClause/clause.service");
const { successResponse, errorResponse } = require("../../utils/response");
const { Op } = require("sequelize");

class ClauseController {
  // ============================================================
  // CLAUSE TEMPLATE ENDPOINTS (Top Hierarchy)
  // ============================================================

  /**
   * GET /clause-template
   * Get all clause templates with nested clauses and clause points
   *
   * Query params:
   *   is_double_database  boolean string (default: true)
   *   search              string — searches template name fields
   *   is_active           boolean string
   */
  async getAllTemplates(req, res) {
    try {
      const {
        is_double_database = true,
        search,
        is_active,
        contract_type,
      } = req.query || {};
      const isDoubleDatabase = is_double_database;

      let where = {};

      if (search) {
        where = {
          [Op.or]: [{ template_name: { [Op.like]: `%${search}%` } }],
        };
      }
      where.is_active = true; // Default filter to only active templates

      if (is_active !== undefined) {
        where.is_active = is_active === "true";
      }
      if (contract_type) {
        where.contract_type = contract_type;
      }

      const templates =
        await clauseTemplateService.getAllTemplatesWithRelations(
          { where },
          isDoubleDatabase
        );

      return successResponse(
        res,
        templates,
        "Clause templates retrieved successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * GET /clause-template/:id
   * Get a single clause template with nested clauses and clause points
   */
  async getTemplateById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true } = req.query || {};
      const isDoubleDatabase = is_double_database !== "false";

      const template = await clauseTemplateService.getTemplateById(
        id,
        {},
        isDoubleDatabase
      );

      if (!template) {
        return errorResponse(res, "Clause template not found", 404);
      }

      return successResponse(
        res,
        template,
        "Clause template retrieved successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * POST /clause-template
   * Create a new ClauseTemplate with clauses and clause points
   *
   * Body (create):
   * {
   *   "is_double_database": true,
   *   "description_indo": "Template Kontrak A",
   *   "description_mandarin": "合同模板A",
   *   "is_active": true,
   *   "clause_list": [
   *     {
   *       "description_indo": "1. Pembayaran",
   *       "description_mandarin": "第五条 - 付款",
   *       "index": 1,
   *       "clause_points": [
   *         {
   *           "description_indo": "1.1 Pembayaran dilakukan dalam 30 hari",
   *           "description_mandarin": "付款应在30天内完成",
   *           "index": 1
   *         }
   *       ]
   *     }
   *   ]
   * }
   *
   * Body (update — include id_clause_template):
   * {
   *   "is_double_database": true,
   *   "id_clause_template": 1,
   *   "description_indo": "Template Kontrak A (edit)",
   *   "description_mandarin": "合同模板A（编辑）",
   *   "is_active": true,
   *   "clause_list": [
   *     {
   *       "id": 1,                           // existing clause → UPDATE
   *       "description_indo": "1. Pembayaran edit",
   *       ...
   *       "clause_points": [
   *         { "id": 1, ... },                // existing point → UPDATE
   *         { "id": null, ... }              // no id → CREATE
   *         // omitting an existing point id → DELETE that point
   *       ]
   *     },
   *     {
   *       // no id → CREATE new clause
   *       "description_indo": "3. Klausul Baru",
   *       ...
   *     }
   *     // omitting an existing clause id → DELETE that clause
   *   ]
   * }
   */
  async createUpdateTemplate(req, res) {
    try {
      const {
        is_double_database = true,
        clause_list = [],
        ...templateFields
      } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;

      // ── Validate clause_list ──────────────────────────────────────────────
      if (!Array.isArray(clause_list)) {
        return errorResponse(res, "clause_list must be an array", 400);
      }

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

        if (item.clause_points && !Array.isArray(item.clause_points)) {
          return errorResponse(
            res,
            `clause_points must be an array for clause at index ${i}`,
            400
          );
        }

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

      // ── Normalise defaults ────────────────────────────────────────────────
      const normalizedClauseList = clause_list.map((item) => ({
        ...item,
        is_active: item.is_active !== undefined ? item.is_active : true,
        clause_points: (item.clause_points || []).map((point) => ({
          ...point,
          is_active: point.is_active !== undefined ? point.is_active : true,
        })),
      }));

      const payload = {
        ...templateFields,
        is_active:
          templateFields.is_active !== undefined
            ? templateFields.is_active
            : true,
        clause_list: normalizedClauseList,
      };

      const result = await clauseTemplateService.upsertTemplateWithClauses(
        payload,
        isDoubleDatabase
      );

      const isUpdate = result.operation === "updated";
      const created = result.clause_list.filter(
        (r) => r.operation === "created"
      ).length;
      const updated = result.clause_list.filter(
        (r) => r.operation === "updated"
      ).length;

      return successResponse(
        res,
        result,
        `Clause template ${
          isUpdate ? "updated" : "created"
        } successfully (${created} clause(s) created, ${updated} clause(s) updated)`,
        isUpdate ? 200 : 201
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * DELETE /clause-template/:id
   * Delete a ClauseTemplate (cascades to clauses and clause points)
   */
  async deleteTemplate(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true } = req.query || {};
      const isDoubleDatabase = is_double_database !== "false";

      // Check existence first
      const existing = await clauseTemplateService.getTemplateById(
        id,
        {},
        isDoubleDatabase
      );

      if (!existing) {
        return errorResponse(res, "Clause template not found", 404);
      }

      const result = await clauseTemplateService.deleteTemplate(
        id,
        isDoubleDatabase
      );

      return successResponse(
        res,
        result,
        "Clause template deleted successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * PATCH /clause-template/:id/toggle-active
   * Toggle is_active on a ClauseTemplate
   */
  async toggleTemplateActive(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;

      const existing = await clauseTemplateService.getTemplateById(
        id,
        {},
        isDoubleDatabase
      );

      if (!existing) {
        return errorResponse(res, "Clause template not found", 404);
      }

      const TemplateModel = isDoubleDatabase
        ? require("../../models").models.db1.ClauseTemplate
        : require("../../models").models.db2.ClauseTemplate;

      await TemplateModel.update(
        { is_active: !existing.is_active },
        { where: { id } }
      );

      if (isDoubleDatabase) {
        const TemplateModel2 =
          require("../../models").models.db2.ClauseTemplate;
        await TemplateModel2.update(
          { is_active: !existing.is_active },
          { where: { id } }
        );
      }

      return successResponse(
        res,
        { id, is_active: !existing.is_active },
        `Clause template ${
          existing.is_active ? "deactivated" : "activated"
        } successfully`
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new ClauseController();
