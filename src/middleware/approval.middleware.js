const approvalAccess = require("../services/approvalFlow/approvalAccess.service");
const { errorResponse } = require("../utils/response");

/**
 * Allow an approve/reject route only for approvers of the document's current status.
 * Usage: requireApprover("invoice", ["on verification"])
 * fromStatuses defaults to every approval status of the feature.
 */
const requireApprover = (approvalFor, fromStatuses = null) => async (req, res, next) => {
  try {
    await approvalAccess.authorize(approvalFor, req.params.id, req.user?.id, fromStatuses);
    next();
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

module.exports = { requireApprover };
