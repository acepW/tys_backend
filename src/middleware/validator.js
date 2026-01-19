const { validationResult } = require("express-validator");
const { errorResponse } = require("../utils/response");

/**
 * Validate request using express-validator
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const extractedErrors = errors.array().map((err) => ({
      field: err.param,
      message: err.msg,
    }));

    return errorResponse(res, "Validation failed", 400, extractedErrors);
  }

  next();
};

module.exports = {
  validate,
};
