const approvalAccess = require("../../services/approvalFlow/approvalAccess.service");
const { successResponse, errorResponse } = require("../../utils/response");

class MyTaskController {
  /**
   * Documents waiting for the logged-in user's approval.
   * Without approval_for: count per feature. With approval_for: that feature's documents.
   */
  async getAll(req, res) {
    try {
      const { approval_for, page, limit } = req.query || {};
      const result = await approvalAccess.getMyTasks(req.user.id, {
        approvalFor: approval_for || null,
        page: Math.max(parseInt(page) || 1, 1),
        limit: Math.max(parseInt(limit) || 10, 1),
      });
      return successResponse(res, result, "My tasks retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 500);
    }
  }

  /** Whether the logged-in user may approve/reject one document. */
  async canAct(req, res) {
    try {
      const { approval_for, id } = req.query || {};
      if (!approval_for || !id)
        return errorResponse(res, "approval_for and id are required", 400);
      const canAct = await approvalAccess.canActById(approval_for, id, req.user.id);
      return successResponse(res, { is_can_approve_reject: canAct }, "Approval access retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 500);
    }
  }
}

module.exports = new MyTaskController();
