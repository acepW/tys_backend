const approvalFlowService = require("../../services/approvalFlow/approvalFlow.service");
const { successResponse, errorResponse } = require("../../utils/response");
const { Op } = require("sequelize");
const APPROVAL_TARGETS = require("../../services/approvalFlow/approvalTargets");

/**
 * Return an error message when the flow does not match a known feature/status,
 * or when another active flow already covers the same approval_for + status.
 */
const validateFlow = async (data, isDoubleDatabase, excludeId = null) => {
  const target = APPROVAL_TARGETS[data.approval_for];
  if (!target)
    return `approval_for must be one of: ${Object.keys(APPROVAL_TARGETS).join(", ")}`;
  const statuses = Object.keys(target.statuses);
  if (!statuses.includes(data.status))
    return `status for ${data.approval_for} must be one of: ${statuses.join(", ")}`;
  if (data.scope && !["all", "department", "division"].includes(data.scope))
    return "scope must be one of: all, department, division";
  if (data.rule_type && data.rule_type !== "any")
    return 'Only rule_type "any" is supported for now';
  const where = { approval_for: data.approval_for, status: data.status, is_active: true };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const duplicate = await approvalFlowService.findAll({ where }, isDoubleDatabase);
  if (duplicate.length)
    return `An active approval flow for ${data.approval_for} with status "${data.status}" already exists`;
  return null;
};

/**
 * Group flows per feature, in the order of APPROVAL_TARGETS and of each feature's
 * statuses. Flows for an approval_for not in APPROVAL_TARGETS are listed last.
 */
const groupByApprovalFor = (flows) => {
  const groups = new Map(
    Object.entries(APPROVAL_TARGETS).map(([approvalFor, target]) => [
      approvalFor,
      { approval_for: approvalFor, label: target.label, approval_flows: [] },
    ])
  );
  for (const flow of flows.map((row) => (row.toJSON ? row.toJSON() : row))) {
    if (!groups.has(flow.approval_for))
      groups.set(flow.approval_for, {
        approval_for: flow.approval_for,
        label: flow.approval_for,
        approval_flows: [],
      });
    groups.get(flow.approval_for).approval_flows.push(flow);
  }
  return [...groups.values()]
    .filter((group) => group.approval_flows.length)
    .map((group) => {
      const order = Object.keys(APPROVAL_TARGETS[group.approval_for]?.statuses || {});
      const rank = (status) => (order.includes(status) ? order.indexOf(status) : order.length);
      group.approval_flows.sort((a, b) => rank(a.status) - rank(b.status));
      return group;
    });
};

class ApprovalFlowController {
  /**
   * Features, statuses, default labels and supported scopes, for the settings form.
   */
  async getTargets(req, res) {
    const targets = Object.entries(APPROVAL_TARGETS).map(([approvalFor, target]) => ({
      approval_for: approvalFor,
      label: target.label,
      statuses: Object.entries(target.statuses).map(([status, label]) => ({ status, label })),
      scopes: ["all", ...Object.keys(target.scopes || {})],
    }));
    return successResponse(res, targets, "Approval targets retrieved successfully");
  }

  /**
   * Get all approval flows
   */
  async getAll(req, res) {
    try {
      const {
        is_double_database = true,
        approval_for,
        status,
        search,
        page,
        limit,
        group_by,
      } = req.query || {};
      const isDoubleDatabase = is_double_database !== "false";
      if (group_by && group_by !== "approval_for")
        return errorResponse(res, 'group_by only supports "approval_for"', 400);

      let obj = {};
      if (search) {
        obj = {
          [Op.or]: [
            { label: { [Op.like]: `%${search}%` } },
            { approval_for: { [Op.like]: `%${search}%` } },
          ],
        };
      }
      if (status) obj.status = status;
      if (approval_for) obj.approval_for = approval_for;
      obj.is_active = true;

      if (group_by) {
        const flows = await approvalFlowService.getAllWithRelations(
          { where: obj },
          null,
          null,
          isDoubleDatabase
        );
        return successResponse(
          res,
          groupByApprovalFor(flows),
          "Approval flows retrieved successfully"
        );
      }

      const approvalFlows = await approvalFlowService.getAllWithRelations(
        { where: obj },
        parseInt(page),
        parseInt(limit),
        isDoubleDatabase
      );

      return successResponse(
        res,
        approvalFlows,
        "Approval flows retrieved successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get approval flow by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const approvalFlow = await approvalFlowService.getById(
        id,
        {},
        isDoubleDatabase
      );

      if (!approvalFlow) {
        return errorResponse(res, "Approval flow not found", 404);
      }

      return successResponse(
        res,
        approvalFlow,
        "Approval flow retrieved successfully"
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create approval flow
   * approval_flow_positions: array of { id_position, is_active }
   */
  async create(req, res) {
    try {
      const {
        is_double_database,
        approval_flow_positions = [],
        ...approvalFlowData
      } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      if (!approvalFlowData.approval_for) {
        return errorResponse(res, "approval_for is required", 400);
      }
      if (!approvalFlowData.status) {
        return errorResponse(res, "status is required", 400);
      }
      if (!approvalFlowData.label) {
        return errorResponse(res, "label is required", 400);
      }
      if (!approvalFlowData.rule_type) {
        return errorResponse(res, "rule_type is required", 400);
      }
      const invalid = await validateFlow(approvalFlowData, isDoubleDatabase);
      if (invalid) return errorResponse(res, invalid, 400);

      const result = await approvalFlowService.createWithRelations(
        approvalFlowData,
        approval_flow_positions,
        isDoubleDatabase
      );

      return successResponse(
        res,
        result,
        "Approval flow created successfully",
        201
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update approval flow with positions
   * approval_flow_positions: [] — kosong = hapus semua, isi id = update, tanpa id = tambah baru
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        is_double_database,
        approval_flow_positions = [],
        ...approvalFlowData
      } = req.body;

      const isDoubleDatabase = is_double_database !== false;

      const existing = await approvalFlowService.findById(
        id,
        {},
        isDoubleDatabase
      );
      if (!existing) {
        return errorResponse(res, "Approval flow not found", 404);
      }
      const current = existing.toJSON ? existing.toJSON() : existing;
      const invalid = await validateFlow({ ...current, ...approvalFlowData }, isDoubleDatabase, id);
      if (invalid) return errorResponse(res, invalid, 400);

      const result = await approvalFlowService.updateWithRelations(
        id,
        approvalFlowData,
        approval_flow_positions,
        isDoubleDatabase
      );

      return successResponse(res, result, "Approval flow updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete approval flow
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const existing = await approvalFlowService.findById(
        id,
        {},
        isDoubleDatabase
      );
      if (!existing) {
        return errorResponse(res, "Approval flow not found", 404);
      }

      await approvalFlowService.update(
        id,
        { is_active: false },
        isDoubleDatabase
      );

      return successResponse(res, null, "Approval flow deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new ApprovalFlowController();
