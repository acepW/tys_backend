const jwt = require("jsonwebtoken");
const { errorResponse } = require("../utils/response");

/**
 * Middleware to verify JWT from cookie
 * Attaches decoded user payload to req.user
 */
const authenticate = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return errorResponse(res, "Unauthorized — no token provided", 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return errorResponse(res, "Token expired, please login again", 401);
    }
    return errorResponse(res, "Invalid token", 401);
  }
};

/**
 * Middleware to restrict access by role
 * Usage: authorize("admin") or authorize("admin", "manager")
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, "Unauthorized", 401);
    }

    if (!roles.includes(req.user.role)) {
      return errorResponse(
        res,
        "Forbidden — you do not have permission to access this resource",
        403
      );
    }

    next();
  };
};

module.exports = { authenticate, authorize };
