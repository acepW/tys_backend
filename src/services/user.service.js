const DualDatabaseService = require("./dualDatabase.service");
const { models } = require("../models");
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");

class UserService extends DualDatabaseService {
  constructor() {
    super("User");
  }

  /**
   * Get all users with their division relation
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Users with division
   */
  async getAllWithRelations(options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      attributes: { exclude: ["password"] },
      include: [
        {
          model: dbModels.Division,
          as: "division",
          required: false,
        },
      ],
      order: [["name", "ASC"]],
    };

    return await this.findAll(queryOptions, isDoubleDatabase);
  }

  /**
   * Get active users only
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Active users
   */
  async getActiveUsers(isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const options = {
      where: { is_active: true },
      attributes: { exclude: ["password"] },
      include: [
        {
          model: dbModels.Division,
          as: "division",
          required: false,
        },
      ],
      order: [["name", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Get user by ID with division relation
   * @param {Number} id
   * @param {Boolean} isDoubleDatabase
   * @returns {Object|null} User with division
   */
  async getByIdWithRelations(id, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const options = {
      attributes: { exclude: ["password"] },
      include: [
        {
          model: dbModels.Division,
          as: "division",
          required: false,
        },
      ],
    };

    return await this.findById(id, options, isDoubleDatabase);
  }

  /**
   * Find user by email (includes password for auth purposes)
   * @param {String} email
   * @param {Boolean} isDoubleDatabase
   * @returns {Object|null} User
   */
  async findByEmail(email, isDoubleDatabase = true) {
    return await this.findOne({ where: { email } }, isDoubleDatabase);
  }

  /**
   * Check if email already exists
   * @param {String} email
   * @param {Number|null} excludeId - ID to exclude from check (for updates)
   * @param {Boolean} isDoubleDatabase
   * @returns {Boolean} True if exists
   */
  async checkEmailExists(email, excludeId = null, isDoubleDatabase = true) {
    const where = { email };
    if (excludeId) {
      where.id = { [Op.ne]: excludeId };
    }

    const existing = await this.findOne({ where }, isDoubleDatabase);
    return existing !== null;
  }

  /**
   * Hash password
   * @param {String} plainPassword
   * @returns {String} Hashed password
   */
  async hashPassword(plainPassword) {
    const salt = await bcrypt.genSalt(12);
    return await bcrypt.hash(plainPassword, salt);
  }

  /**
   * Compare plain password with hashed password
   * @param {String} plainPassword
   * @param {String} hashedPassword
   * @returns {Boolean}
   */
  async comparePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Create user with hashed password
   * @param {Object} data
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Created user (without password)
   */
  async createUser(data, isDoubleDatabase = true) {
    data.password = await this.hashPassword(data.password);
    const user = await this.create(data, isDoubleDatabase);

    // Return without password
    const { password, ...userWithoutPassword } = user.toJSON
      ? user.toJSON()
      : user;
    return userWithoutPassword;
  }

  /**
   * Update user data (handles password hashing if password is included)
   * @param {Number} id
   * @param {Object} data
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated user (without password)
   */
  async updateUser(id, data, isDoubleDatabase = true) {
    if (data.password) {
      data.password = await this.hashPassword(data.password);
    }

    const user = await this.update(id, data, isDoubleDatabase);

    const { password, ...userWithoutPassword } = user.toJSON
      ? user.toJSON()
      : user;
    return userWithoutPassword;
  }
}

module.exports = new UserService();
