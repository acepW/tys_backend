/**
 * Standard success response format
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {String} message - Success message
 * @param {Number} statusCode - HTTP status code
 * @returns {Object} JSON response
 */
const successResponse = (res, data, message = "Success", statusCode = 200) => {
  // Cek apakah data mengandung pagination
  const isPaginated = data && data.pagination && data.data;

  const response = {
    success: true,
    code: statusCode,
    message,
    ...(isPaginated
      ? {
          pagination: data.pagination,
          data: data.data,
        }
      : { data }),
    timestamp: new Date().toISOString(),
  };

  return res.status(statusCode).json(response);
};

/**
 * Standard error response format
 * @param {Object} res - Express response object
 * @param {String} message - Error message
 * @param {Number} statusCode - HTTP status code
 * @param {Object} errors - Additional error details
 * @returns {Object} JSON response
 */
const errorResponse = (
  res,
  message = "Internal Server Error",
  statusCode = 500,
  errors = null,
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
    data: null,
    timestamp: new Date().toISOString(),
  });
};

module.exports = {
  successResponse,
  errorResponse,
};
