const { db1, db2 } = require("../config/database");
const CategoryModel = require("./category.model");
const CompanyModel = require("./company.model");
const ProductModel = require("./masterProduct/product.model");
const ProductFieldsModel = require("./masterProduct/productField.model");
const CustomerModel = require("./customer.model");

/**
 * Initialize all models for a given sequelize instance
 * @param {Sequelize} sequelize - Sequelize instance
 * @returns {Object} Object containing all initialized models
 */
const initializeModels = (sequelize) => {
  // Initialize all models
  const models = {
    Category: CategoryModel(sequelize),
    Company: CompanyModel(sequelize),
    Product: ProductModel(sequelize),
    ProductFields: ProductFieldsModel(sequelize),
    Customer: CustomerModel(sequelize),
  };

  // Setup associations for all models
  Object.keys(models).forEach((modelName) => {
    if (models[modelName].associate) {
      models[modelName].associate(models);
    }
  });

  return models;
};

// Initialize models for both databases
const models = {
  db1: initializeModels(db1),
  db2: initializeModels(db2),
};

/**
 * Sync all databases
 * @param {Object} options - Sequelize sync options
 */
const syncDatabases = async (options = { alter: true }) => {
  try {
    console.log("🔄 Starting database synchronization...");

    // Sync Database 1
    await db1.sync(options);
    console.log("✅ Database 1 (Primary) synced successfully");

    // Sync Database 2
    await db2.sync(options);
    console.log("✅ Database 2 (Secondary) synced successfully");

    console.log("✅ All databases synchronized successfully");
  } catch (error) {
    console.error("❌ Error syncing databases:", error.message);
    throw error;
  }
};

module.exports = {
  models,
  db1,
  db2,
  syncDatabases,
};
