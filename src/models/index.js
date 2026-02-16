const { db1, db2 } = require("../config/database");
//maser data
const CategoryModel = require("./category.model");
const CompanyModel = require("./company.model");
const ProductModel = require("./masterProduct/product.model");
const ProductFieldsModel = require("./masterProduct/productField.model");
const CustomerModel = require("./customer.model");
const DivisionModel = require("./division.model");
const FlowProcessModel = require("./masterFlowProcess/flowProcess.model");
const ClauseModel = require("./masterClause/clause.model");
const ClausePointModel = require("./masterClause/clausePoint.model");

//service pricing
const ServicePricingModel = require("./servicePricing/servicePricing.model");
const ServicePricingVariantModel = require("./servicePricing/servicePricingVarian.model");

//quotations
const QuotationModel = require("./quotation/quotation.model");
const QuotationCategoryModel = require("./quotation/quotationCategory.model");
const QuotationServiceModel = require("./quotation/quotationService.model");
const QuotationProductModel = require("./quotation/quotationProduct.model");
const QuotationProductFieldModel = require("./quotation/quotationProductField.model");

//contract
const ContractModel = require("./contract/contract.model");
const ContractServiceModel = require("./contract/contractService.model");
const ContractVerificationProgressModel = require("./contract/contactVerificationProgress.mode");
const ContractClauseModel = require("./contract/contractClause.model");
const ContractClausePointModel = require("./contract/contractClausePoint.model");
const ContractClauseLogModel = require("./contract/contractClauseLog.model");

/**
 * Initialize all models for a given sequelize instance
 * @param {Sequelize} sequelize - Sequelize instance
 * @returns {Object} Object containing all initialized models
 */
const initializeModels = (sequelize) => {
  // Initialize all models
  const models = {
    // Master Data
    Category: CategoryModel(sequelize),
    Company: CompanyModel(sequelize),
    Product: ProductModel(sequelize),
    ProductFields: ProductFieldsModel(sequelize),
    Customer: CustomerModel(sequelize),
    Division: DivisionModel(sequelize),
    FlowProcess: FlowProcessModel(sequelize),
    Clause: ClauseModel(sequelize),
    ClausePoint: ClausePointModel(sequelize),

    // Service Pricing
    ServicePricing: ServicePricingModel(sequelize),
    ServicePricingVariant: ServicePricingVariantModel(sequelize),

    //quotation
    Quotation: QuotationModel(sequelize),
    QuotationCategory: QuotationCategoryModel(sequelize),
    QuotationService: QuotationServiceModel(sequelize),
    QuotationProduct: QuotationProductModel(sequelize),
    QuotationProductField: QuotationProductFieldModel(sequelize),

    //contract
    Contract: ContractModel(sequelize),
    ContractService: ContractServiceModel(sequelize),
    ContractVerificationProgress: ContractVerificationProgressModel(sequelize),
    ContractClause: ContractClauseModel(sequelize),
    ContractClausePoint: ContractClausePointModel(sequelize),
    ContractClauseLog: ContractClauseLogModel(sequelize),
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
