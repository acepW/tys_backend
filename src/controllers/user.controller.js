const jwt = require("jsonwebtoken");
const userService = require("../services/user.service");
const { successResponse, errorResponse } = require("../utils/response");

// Cookie config
const COOKIE_NAME = "token";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "None",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Generate JWT token
 * @param {Object} payload
 * @returns {String} JWT token
 */
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

class UserController {
  // ─────────────────────────────────────────────
  // AUTH
  // ─────────────────────────────────────────────

  /**
   * Login — POST /auth/login
   */
  async login(req, res) {
    try {
      const { email, password, is_double_database } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      console.log(req.body);

      if (!email || !password) {
        return errorResponse(res, "Email and password are required", 400);
      }

      // Find user by email (with password field)
      const user = await userService.findByEmail(email, isDoubleDatabase);
      if (!user) {
        return errorResponse(res, "Invalid email or password", 401);
      }

      if (!user.is_active) {
        return errorResponse(res, "Your account is inactive", 403);
      }

      // Verify password
      const isMatch = await userService.comparePassword(
        password,
        user.password
      );
      if (!isMatch) {
        return errorResponse(res, "Invalid email or password", 401);
      }

      // Generate token
      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
        id_division: user.id_division,
      });

      // Set cookie
      res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

      // Return user without password
      const { password: _pw, ...userWithoutPassword } = user.toJSON
        ? user.toJSON()
        : user;

      console.log(1);
      return successResponse(
        res,
        { user: userWithoutPassword },
        "Login successful"
      );
    } catch (error) {
      console.log(error);
      return errorResponse(res, error.message);
    }
  }

  /**
   * Logout — POST /auth/logout
   */
  async logout(req, res) {
    try {
      res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: true,
        sameSite: "None",
      });

      return successResponse(res, null, "Logout successful");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get current authenticated user — GET /auth/me
   * Requires auth middleware to attach req.user
   */
  async getMe(req, res) {
    try {
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const user = await userService.getByIdWithRelations(
        req.user.id,
        isDoubleDatabase
      );

      if (!user) {
        return errorResponse(res, "User not found", 404);
      }

      return successResponse(res, user, "User retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  // ─────────────────────────────────────────────
  // CRUD
  // ─────────────────────────────────────────────

  /**
   * Get all users — GET /users
   */
  async getAll(req, res) {
    try {
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const users = await userService.getAllWithRelations({}, isDoubleDatabase);

      return successResponse(res, users, "Users retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get active users — GET /users/active
   */
  async getActive(req, res) {
    try {
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const users = await userService.getActiveUsers(isDoubleDatabase);

      return successResponse(res, users, "Active users retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get user by ID — GET /users/:id
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const user = await userService.getByIdWithRelations(id, isDoubleDatabase);

      if (!user) {
        return errorResponse(res, "User not found", 404);
      }

      return successResponse(res, user, "User retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create new user — POST /users
   */
  async create(req, res) {
    try {
      const { is_double_database, id_division, email, name, password, role } =
        req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Validation
      if (!email) return errorResponse(res, "Email is required", 400);
      if (!name) return errorResponse(res, "Name is required", 400);
      if (!password) return errorResponse(res, "Password is required", 400);
      if (!role) return errorResponse(res, "Role is required", 400);
      if (!id_division) return errorResponse(res, "Division is required", 400);

      // Password minimum length
      if (password.length < 6) {
        return errorResponse(
          res,
          "Password must be at least 6 characters",
          400
        );
      }

      // Check duplicate email
      const emailExists = await userService.checkEmailExists(
        email,
        null,
        isDoubleDatabase
      );
      if (emailExists) {
        return errorResponse(res, "Email already exists", 400);
      }

      const data = {
        id_division,
        email,
        name,
        password,
        role,
        is_active: true,
      };

      const user = await userService.createUser(data, isDoubleDatabase);

      return successResponse(res, user, "User created successfully", 201);
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update user — PUT /users/:id
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        is_double_database,
        id_division,
        email,
        name,
        password,
        role,
        is_active,
      } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if user exists
      const existing = await userService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "User not found", 404);
      }

      const data = {};

      if (id_division !== undefined) data.id_division = id_division;
      if (name !== undefined) data.name = name;
      if (role !== undefined) data.role = role;
      if (is_active !== undefined) data.is_active = is_active;

      if (email !== undefined) {
        const emailExists = await userService.checkEmailExists(
          email,
          id,
          isDoubleDatabase
        );
        if (emailExists) {
          return errorResponse(res, "Email already exists", 400);
        }
        data.email = email;
      }

      if (password !== undefined) {
        if (password.length < 6) {
          return errorResponse(
            res,
            "Password must be at least 6 characters",
            400
          );
        }
        data.password = password; // will be hashed in updateUser
      }

      const user = await userService.updateUser(id, data, isDoubleDatabase);

      return successResponse(res, user, "User updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete user — DELETE /users/:id
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      // Prevent self-deletion
      if (req.user && String(req.user.id) === String(id)) {
        return errorResponse(res, "You cannot delete your own account", 400);
      }

      const existing = await userService.findById(id, {}, isDoubleDatabase);
      if (!existing) {
        return errorResponse(res, "User not found", 404);
      }

      await userService.delete(id, isDoubleDatabase);

      return successResponse(res, null, "User deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Change own password — PATCH /auth/change-password
   * Requires auth middleware
   */
  async changePassword(req, res) {
    try {
      const { current_password, new_password, is_double_database } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      if (!current_password || !new_password) {
        return errorResponse(
          res,
          "Current password and new password are required",
          400
        );
      }

      if (new_password.length < 6) {
        return errorResponse(
          res,
          "New password must be at least 6 characters",
          400
        );
      }

      // Fetch user with password
      const user = await userService.findById(
        req.user.id,
        {},
        isDoubleDatabase
      );
      if (!user) {
        return errorResponse(res, "User not found", 404);
      }

      const isMatch = await userService.comparePassword(
        current_password,
        user.password
      );
      if (!isMatch) {
        return errorResponse(res, "Current password is incorrect", 400);
      }

      await userService.updateUser(
        req.user.id,
        { password: new_password },
        isDoubleDatabase
      );

      return successResponse(res, null, "Password changed successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new UserController();
