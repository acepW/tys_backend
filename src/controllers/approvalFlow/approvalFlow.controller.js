const approvalFlowService = require("../../services/approvalFlow/approvalFlow.service");
const { successResponse, errorResponse } = require("../../utils/response");
const { Op } = require("sequelize");

class ApprovalFlowController {
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
      } = req.query || {};
      const isDoubleDatabase = is_double_database !== "false";

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
