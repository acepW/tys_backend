const contractService = require("../../services/contract/contract.service");
const { successResponse, errorResponse } = require("../../utils/response");

class ContractController {
  // ============================================================
  // Helper: validate clauses[] payload (clause -> clause_point ->
  // clause_point_sub -> clause_point_sub_child)
  // ============================================================
  _validateClauses(clauses) {
    if (!Array.isArray(clauses)) {
      return "clauses must be an array";
    }

    for (let i = 0; i < clauses.length; i++) {
      const item = clauses[i];

      if (!item.description_indo) {
        return `description_indo is required for clause at index ${i}`;
      }
      if (!item.description_mandarin) {
        return `description_mandarin is required for clause at index ${i}`;
      }
      if (item.clause_point && !Array.isArray(item.clause_point)) {
        return `clause_point must be an array for clause at index ${i}`;
      }

      if (item.clause_point && item.clause_point.length > 0) {
        for (let j = 0; j < item.clause_point.length; j++) {
          const point = item.clause_point[j];

          if (!point.description_indo) {
            return `description_indo is required for clause_point at clause index ${i}, point index ${j}`;
          }
          if (!point.description_mandarin) {
            return `description_mandarin is required for clause_point at clause index ${i}, point index ${j}`;
          }
          if (
            point.clause_point_sub &&
            !Array.isArray(point.clause_point_sub)
          ) {
            return `clause_point_sub must be an array for clause index ${i}, point index ${j}`;
          }

          if (point.clause_point_sub && point.clause_point_sub.length > 0) {
            for (let k = 0; k < point.clause_point_sub.length; k++) {
              const sub = point.clause_point_sub[k];

              if (!sub.description_indo) {
                return `description_indo is required for clause_point_sub at clause index ${i}, point index ${j}, sub index ${k}`;
              }
              if (!sub.description_mandarin) {
                return `description_mandarin is required for clause_point_sub at clause index ${i}, point index ${j}, sub index ${k}`;
              }
              if (
                sub.clause_point_sub_child &&
                !Array.isArray(sub.clause_point_sub_child)
              ) {
                return `clause_point_sub_child must be an array at clause index ${i}, point index ${j}, sub index ${k}`;
              }

              if (
                sub.clause_point_sub_child &&
                sub.clause_point_sub_child.length > 0
              ) {
                for (let l = 0; l < sub.clause_point_sub_child.length; l++) {
                  const child = sub.clause_point_sub_child[l];

                  if (!child.description_indo) {
                    return `description_indo is required for clause_point_sub_child at clause index ${i}, point index ${j}, sub index ${k}, child index ${l}`;
                  }
                  if (!child.description_mandarin) {
                    return `description_mandarin is required for clause_point_sub_child at clause index ${i}, point index ${j}, sub index ${k}, child index ${l}`;
                  }
                }
              }
            }
          }
        }
      }
    }

    return null;
  }

  // ============================================================
  // Helper: validate clause_header[] / clause_footer[] (flat)
  // ============================================================
  _validateFlatClauseList(list, label) {
    if (!Array.isArray(list)) {
      return `${label} must be an array`;
    }
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (!entry.description_indo) {
        return `description_indo is required for ${label} at index ${i}`;
      }
      if (!entry.description_mandarin) {
        return `description_mandarin is required for ${label} at index ${i}`;
      }
    }
    return null;
  }

  // ============================================================
  // Helper: normalise defaults (is_active) across the whole tree
  // ============================================================
  _normalizeClauses(clauses = []) {
    return clauses.map((item) => ({
      ...item,
      is_active: item.is_active !== undefined ? item.is_active : true,
      clause_point: (item.clause_point || []).map((point) => ({
        ...point,
        is_active: point.is_active !== undefined ? point.is_active : true,
        clause_point_sub: (point.clause_point_sub || []).map((sub) => ({
          ...sub,
          is_active: sub.is_active !== undefined ? sub.is_active : true,
          clause_point_sub_child: (sub.clause_point_sub_child || []).map(
            (child) => ({
              ...child,
              is_active: child.is_active !== undefined ? child.is_active : true,
            })
          ),
        })),
      })),
    }));
  }

  _normalizeFlatList(list = []) {
    return list.map((entry) => ({
      ...entry,
      is_active: entry.is_active !== undefined ? entry.is_active : true,
    }));
  }

  // ============================================================
  // GET /contract
  // ============================================================
  async getAll(req, res) {
    try {
      const {
        is_double_database = true,
        page,
        limit,
        include_history,
        search,
        id_company,
        id_customer,
        status,
      } = req.query || {};
      const isDoubleDatabase = is_double_database !== "false";
      const includeHistory = include_history === "true";

      let where = {};
      if (search) {
        where.contract_no = { [require("sequelize").Op.like]: `%${search}%` };
      }
      if (id_company) where.id_company = id_company;
      if (id_customer) where.id_customer = id_customer;
      if (status) where.status = status;

      const result = await contractService.getAllWithRelations(
        { where },
        page ? parseInt(page, 10) : null,
        limit ? parseInt(limit, 10) : null,
        isDoubleDatabase,
        includeHistory
      );

      return successResponse(res, result, "Contracts retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  // ============================================================
  // GET /contract/:id
  // ============================================================
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true } = req.query || {};
      const isDoubleDatabase = is_double_database !== "false";

      const contract = await contractService.getById(id, {}, isDoubleDatabase);

      if (!contract) {
        return errorResponse(res, "Contract not found", 404);
      }

      return successResponse(res, contract, "Contract retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  // ============================================================
  // GET /contract/:id/history
  // ============================================================
  async getHistory(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true } = req.query || {};
      const isDoubleDatabase = is_double_database !== "false";

      const history = await contractService.getHistory(id, isDoubleDatabase);

      return successResponse(
        res,
        history,
        "Contract history retrieved successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  // ============================================================
  // GET /contract/no-contract
  // ============================================================
  async getNoContract(req, res) {
    try {
      const { is_double_database = true } = req.query || {};
      const isDoubleDatabase = is_double_database !== "false";

      const result = await contractService.getNoContract(isDoubleDatabase);

      return successResponse(
        res,
        result,
        "Next contract number retrieved successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * POST /contract
   * Body:
   * {
   *   "is_double_database": true,
   *   "replace_contract_id": 1,          // optional, adendum/replacement flow
   *   "id_company": 1,
   *   "id_customer": 1,
   *   "id_quotation": 1,
   *   "date": "2026-02-16",
   *   "contract_no": "035/KPJ/TYS/VII/2026",
   *   "contract_title_indo": "...",
   *   "contract_title_mandarin": "...",
   *   "contract_type": "Service Agreement",
   *   "note": "Optional note",
   *   "services": [ ... ],
   *   "clause_header": [
   *     { "description_indo": "...", "description_mandarin": "...", "index": 1, "is_view_product": false }
   *   ],
   *   "clause_footer": [
   *     { "description_indo": "...", "description_mandarin": "...", "index": 1 }
   *   ],
   *   "clauses": [
   *     {
   *       "description_indo": "...",
   *       "description_mandarin": "...",
   *       "index": 1,
   *       "clause_point": [
   *         {
   *           "description_indo": "...",
   *           "description_mandarin": "...",
   *           "index": 1,
   *           "clause_point_sub": [
   *             {
   *               "description_indo": "...",
   *               "description_mandarin": "...",
   *               "index": 1,
   *               "clause_point_sub_child": [
   *                 { "description_indo": "...", "description_mandarin": "...", "index": 1 }
   *               ]
   *             }
   *           ],
   *           "clause_logs": [ ... ]
   *         }
   *       ],
   *       "clause_logs": [ ... ]
   *     }
   *   ],
   *   "payment_request_contract": [ ... ]
   * }
   */
  async create(req, res) {
    try {
      const {
        is_double_database = true,
        replace_contract_id = null,
        services = [],
        clause_header = [],
        clause_footer = [],
        clauses = [],
        payment_request_contract = [],
        ...contractFields
      } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;
      const id_user_create = req.user?.id || req.body.id_user_create;

      // ── Validate services ─────────────────────────────────────────────
      if (!Array.isArray(services)) {
        return errorResponse(res, "services must be an array", 400);
      }

      // ── Validate clause_header ────────────────────────────────────────
      const headerError = this._validateFlatClauseList(
        clause_header,
        "clause_header"
      );
      if (headerError) return errorResponse(res, headerError, 400);

      // ── Validate clause_footer ───────────────────────────────────────
      const footerError = this._validateFlatClauseList(
        clause_footer,
        "clause_footer"
      );
      if (footerError) return errorResponse(res, footerError, 400);

      // ── Validate clauses (deep tree incl. clause_point_sub_child) ──────
      const clausesError = this._validateClauses(clauses);
      if (clausesError) return errorResponse(res, clausesError, 400);

      // ── Validate payment_request_contract ───────────────────────────────
      if (!Array.isArray(payment_request_contract)) {
        return errorResponse(
          res,
          "payment_request_contract must be an array",
          400
        );
      }

      // ── Normalise defaults ────────────────────────────────────────────
      const normalizedClauses = this._normalizeClauses(clauses);
      const normalizedClauseHeader = this._normalizeFlatList(clause_header);
      const normalizedClauseFooter = this._normalizeFlatList(clause_footer);

      const contractData = {
        ...contractFields,
        is_active:
          contractFields.is_active !== undefined
            ? contractFields.is_active
            : true,
      };

      const result = await contractService.createWithRelations(
        contractData,
        services,
        normalizedClauseHeader,
        normalizedClauses,
        payment_request_contract,
        id_user_create,
        isDoubleDatabase,
        replace_contract_id,
        normalizedClauseFooter
      );

      return successResponse(res, result, "Contract created successfully", 201);
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * PUT /contract/:id
   * Body: same shape as create, minus is_double_database toggling relates
   * to which DB pair to update. clause/point/sub/child items that include
   * "id" are updated, items without "id" are created, and existing items
   * not present in the payload are deleted (cascades to their children).
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        is_double_database = true,
        services = [],
        clause_header = [],
        clause_footer = [],
        clauses = [],
        ...contractFields
      } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;

      const existing = await contractService.getById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Contract not found", 404);
      }

      // ── Validate services ─────────────────────────────────────────────
      if (!Array.isArray(services)) {
        return errorResponse(res, "services must be an array", 400);
      }

      // ── Validate clause_header ────────────────────────────────────────
      const headerError = this._validateFlatClauseList(
        clause_header,
        "clause_header"
      );
      if (headerError) return errorResponse(res, headerError, 400);

      // ── Validate clause_footer ───────────────────────────────────────
      const footerError = this._validateFlatClauseList(
        clause_footer,
        "clause_footer"
      );
      if (footerError) return errorResponse(res, footerError, 400);

      // ── Validate clauses (deep tree incl. clause_point_sub_child) ──────
      const clausesError = this._validateClauses(clauses);
      if (clausesError) return errorResponse(res, clausesError, 400);

      // ── Normalise defaults ────────────────────────────────────────────
      const normalizedClauses = this._normalizeClauses(clauses);
      const normalizedClauseHeader = this._normalizeFlatList(clause_header);
      const normalizedClauseFooter = this._normalizeFlatList(clause_footer);

      const result = await contractService.updateWithRelations(
        id,
        contractFields,
        services,
        normalizedClauseHeader,
        normalizedClauses,
        isDoubleDatabase,
        normalizedClauseFooter
      );

      return successResponse(res, result, "Contract updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  // ============================================================
  // POST /contract/:id/submit
  // ============================================================
  async submit(req, res) {
    try {
      const { id } = req.params;
      const { note, is_double_database = true } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;
      const id_user = req.user?.id || req.body.id_user;

      const result = await contractService.submitContract(
        id,
        note,
        id_user,
        isDoubleDatabase
      );

      return successResponse(res, result, "Contract submitted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  // ============================================================
  // POST /contract/:id/approve
  // ============================================================
  async approve(req, res) {
    try {
      const { id } = req.params;
      const { note, is_double_database = true } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;
      const id_user = req.user?.id || req.body.id_user;

      const result = await contractService.approveContract(
        id,
        note,
        id_user,
        isDoubleDatabase
      );

      return successResponse(res, result, "Contract approved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  // ============================================================
  // POST /contract/:id/reject
  // ============================================================
  async reject(req, res) {
    try {
      const { id } = req.params;
      const { note, is_double_database = true } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;
      const id_user = req.user?.id || req.body.id_user;

      const result = await contractService.rejectContract(
        id,
        note,
        id_user,
        isDoubleDatabase
      );

      return successResponse(res, result, "Contract rejected successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  // ============================================================
  // POST /contract/:id/send-to-customer
  // ============================================================
  async sendToCustomer(req, res) {
    try {
      const { id } = req.params;
      const { note, is_double_database = true } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;
      const id_user = req.user?.id || req.body.id_user;

      const result = await contractService.sendToCustomer(
        id,
        note,
        id_user,
        isDoubleDatabase
      );

      return successResponse(
        res,
        result,
        "Contract sent to customer successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  // ============================================================
  // POST /contract/:id/approve-by-customer
  // ============================================================
  async approveByCustomer(req, res) {
    try {
      const { id } = req.params;
      const { note, is_double_database = true } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;
      const id_user = req.user?.id || req.body.id_user;

      const result = await contractService.approveByCustomer(
        id,
        note,
        id_user,
        isDoubleDatabase
      );

      return successResponse(
        res,
        result,
        "Contract approved by customer successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  // ============================================================
  // POST /contract/:id/reject-by-customer
  // ============================================================
  async rejectByCustomer(req, res) {
    try {
      const { id } = req.params;
      const { note, is_double_database = true } = req.body || {};
      const isDoubleDatabase = is_double_database !== false;
      const id_user = req.user?.id || req.body.id_user;

      const result = await contractService.rejectByCustomer(
        id,
        note,
        id_user,
        isDoubleDatabase
      );

      return successResponse(
        res,
        result,
        "Contract rejected by customer successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
  /**
   * Open Payment
   */
  async openPayment(req, res) {
    try {
      const { id_payment } = req.params;
      const { is_double_database = true } = req.body || {};
      const isDoubleDatabase = is_double_database;

      // Check if contract exists
      const existing = await paymentService.findById(
        id_payment,
        {},
        isDoubleDatabase
      );
      if (!existing) {
        return errorResponse(res, "Payment not found", 404);
      }

      const result = await paymentService.update(
        id_payment,
        { is_open: true },
        isDoubleDatabase
      );

      return successResponse(res, result, "Payment opened successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete contract
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      // Check if contract exists
      const existing = await contractService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "Contract not found", 404);
      }

      await contractService.update(id, { is_active: false }, isDoubleDatabase);

      return successResponse(res, null, "Contract deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new ContractController();
