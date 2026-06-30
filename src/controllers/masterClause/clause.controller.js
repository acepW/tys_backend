const clauseTemplateService = require("../../services/masterClause/clause.service");
const { successResponse, errorResponse } = require("../../utils/response");
const { Op } = require("sequelize");

class ClauseController {
  // ============================================================
  // CLAUSE TEMPLATE ENDPOINTS (Top Hierarchy)
  // ============================================================

  /**
   * GET /clause-template
   * Get all clause templates with nested clauses, clause points,
   * clause point subs, and clause headers
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
   * Get a single clause template with nested clauses, clause points,
   * clause point subs, and clause headers
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
   * Create a new ClauseTemplate with clauses, clause points,
   * clause point subs, and clause headers
   *
   * Body (create):
   * {
   *   "is_double_database": true,
   *   "template_name": "Template Kontrak A",
   *   "contract_type": "contract",
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
   *           "index": 1,
   *           "clause_point_sub": [
   *             {
   *               "description_indo": "1.1.1 Sub poin contoh",
   *               "description_mandarin": "子条款示例",
   *               "index": 1
   *             }
   *           ]
   *         }
   *       ]
   *     }
   *   ],
   *   "clauses_header": [
   *     {
   *       "description_indo": "BAB I - Ketentuan Umum",
   *       "description_mandarin": "第一章 - 总则",
   *       "index": 1,
   *       "iis_view_product": false
   *     }
   *   ]
   * }
   *
   * Body (update — include id_clause_template):
   * {
   *   "is_double_database": true,
   *   "id_clause_template": 1,
   *   "template_name": "Template Kontrak A (edit)",
   *   "contract_type": "contract",
   *   "is_active": true,
   *   "clause_list": [
   *     {
   *       "id": 1,                           // existing clause → UPDATE
   *       "description_indo": "1. Pembayaran edit",
   *       ...
   *       "clause_points": [
   *         {
   *           "id": 1,                       // existing point → UPDATE
   *           ...
   *           "clause_point_sub": [
   *             { "id": 1, ... },             // existing sub → UPDATE
   *             { "id": null, ... }           // no id → CREATE
   *             // omitting an existing sub id → DELETE that sub
   *           ]
   *         },
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
   *   ],
   *   "clauses_header": [
   *     { "id": 1, ... },                    // existing header → UPDATE
   *     { "id": null, ... }                  // no id → CREATE
   *     // omitting an existing header id → DELETE that header
   *   ]
   * }
   */
  async createUpdateTemplate(req, res) {
    try {
      const {
        is_double_database = true,
        clause_list = [],
        clauses_header = [],
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

            if (
              point.clause_point_sub &&
              !Array.isArray(point.clause_point_sub)
            ) {
              return errorResponse(
                res,
                `clause_point_sub must be an array for clause index ${i}, point index ${j}`,
                400
              );
            }

            if (point.clause_point_sub && point.clause_point_sub.length > 0) {
              for (let k = 0; k < point.clause_point_sub.length; k++) {
                const sub = point.clause_point_sub[k];

                if (!sub.description_indo) {
                  return errorResponse(
                    res,
                    `description_indo is required for clause_point_sub at clause index ${i}, point index ${j}, sub index ${k}`,
                    400
                  );
                }

                if (!sub.description_mandarin) {
                  return errorResponse(
                    res,
                    `description_mandarin is required for clause_point_sub at clause index ${i}, point index ${j}, sub index ${k}`,
                    400
                  );
                }
              }
            }
          }
        }
      }

      // ── Validate clauses_header ───────────────────────────────────────
      if (!Array.isArray(clauses_header)) {
        return errorResponse(res, "clauses_header must be an array", 400);
      }

      for (let i = 0; i < clauses_header.length; i++) {
        const header = clauses_header[i];

        if (!header.description_indo) {
          return errorResponse(
            res,
            `description_indo is required for clauses_header at index ${i}`,
            400
          );
        }

        if (!header.description_mandarin) {
          return errorResponse(
            res,
            `description_mandarin is required for clauses_header at index ${i}`,
            400
          );
        }
      }

      // ── Normalise defaults ────────────────────────────────────────────────
      const normalizedClauseList = clause_list.map((item) => ({
        ...item,
        is_active: item.is_active !== undefined ? item.is_active : true,
        clause_points: (item.clause_points || []).map((point) => ({
          ...point,
          is_active: point.is_active !== undefined ? point.is_active : true,
          clause_point_sub: (point.clause_point_sub || []).map((sub) => ({
            ...sub,
            is_active: sub.is_active !== undefined ? sub.is_active : true,
          })),
        })),
      }));

      const normalizedClauseHeaderList = clauses_header.map((header) => ({
        ...header,
        is_active: header.is_active !== undefined ? header.is_active : true,
        iis_view_product:
          header.iis_view_product !== undefined
            ? header.iis_view_product
            : false,
      }));

      const payload = {
        ...templateFields,
        is_active:
          templateFields.is_active !== undefined
            ? templateFields.is_active
            : true,
        clause_list: normalizedClauseList,
        clauses_header: normalizedClauseHeaderList,
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
   * Delete a ClauseTemplate (cascades to clauses, clause points,
   * clause point subs and clause headers)
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
