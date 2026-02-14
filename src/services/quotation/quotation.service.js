const DualDatabaseService = require("../dualDatabase.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");

class QuotationService extends DualDatabaseService {
  constructor() {
    super("Quotation");
  }

  /**
   * Get all quotations with relations
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Quotations with relations
   */
  async getAllWithRelations(options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.Company,
          as: "company",
          attributes: ["id", "company_name"],
        },
        {
          model: dbModels.Customer,
          as: "customer",
          attributes: ["id", "company_name"],
        },
        {
          model: dbModels.QuotationCategory,
          as: "quotation_category",
          separate: true,
          include: [
            {
              model: dbModels.Category,
              as: "category",
              attributes: [
                "id",
                "category_name_indo",
                "category_name_mandarin",
              ],
            },
            {
              model: dbModels.QuotationService,
              as: "services",
              separate: true,
              include: [
                {
                  model: dbModels.ServicePricing,
                  as: "service_pricing",
                  attributes: [
                    "id",
                    "product_name_indo",
                    "product_name_mandarin",
                  ],
                },
              ],
            },
            {
              model: dbModels.QuotationProduct,
              as: "products",
              separate: true,
              include: [
                {
                  model: dbModels.QuotationProductField,
                  as: "fields",
                  separate: true,
                },
              ],
            },
          ],
        },
      ],
    };

    return await this.findAll(queryOptions, isDoubleDatabase);
  }

  /**
   * Get quotation by ID with relations
   * @param {Number} id
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Quotation with relations
   */
  async getById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.Company,
          as: "company",
        },
        {
          model: dbModels.Customer,
          as: "customer",
        },
        {
          model: dbModels.QuotationCategory,
          as: "quotation_category",
          include: [
            {
              model: dbModels.Category,
              as: "category",
              attributes: [
                "id",
                "category_name_indo",
                "category_name_mandarin",
                "foot_note",
              ],
            },
            {
              model: dbModels.QuotationService,
              as: "services",
              include: [
                {
                  model: dbModels.ServicePricing,
                  as: "service_pricing",
                  attributes: [
                    "id",
                    "product_name_indo",
                    "product_name_mandarin",
                    "note_indo",
                    "note_mandarin",
                    "required_document",
                    "processing_time",
                  ],
                },
              ],
            },
            {
              model: dbModels.QuotationProduct,
              as: "products",
              include: [
                {
                  model: dbModels.QuotationProductField,
                  as: "fields",
                },
              ],
            },
          ],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Create quotation with nested categories, services, products, and fields
   * @param {Object} quotationData - Quotation data
   * @param {Array} categoriesData - Array of quotation categories with services and products
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Object} Created quotation with all nested relations
   */
  async createWithNested(
    quotationData,
    categoriesData = [],
    isDoubleDatabase = true
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Creating Quotation with nested relations in both databases...`
        );
        console.log(`📋 Categories to create: ${categoriesData.length}`);

        // 1. Create Quotation in DB1
        const quotation1 = await this.Model1.create(quotationData, {
          transaction: transaction1,
        });
        console.log(`✅ Created Quotation in DB1 with ID: ${quotation1.id}`);

        // 2. Create Quotation in DB2 with same ID
        const quotationDataWithId = {
          ...quotationData,
          id: quotation1.id,
        };
        await this.Model2.create(quotationDataWithId, {
          transaction: transaction2,
        });
        console.log(`✅ Created Quotation in DB2 with ID: ${quotation1.id}`);

        // 3. Process Quotation Categories
        if (categoriesData && categoriesData.length > 0) {
          console.log(
            `🔄 Starting to sync ${categoriesData.length} categories...`
          );
          const syncedCategories = await this._syncQuotationCategories(
            quotation1.id,
            categoriesData,
            transaction1,
            transaction2,
            isDoubleDatabase
          );
          console.log(
            `✅ Categories sync completed: ${syncedCategories.length} categories processed`
          );
        } else {
          console.log(`ℹ️ No categories to sync`);
        }

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Quotation with nested relations successfully created`);

        // Get complete quotation with relations
        const result = await this.getById(quotation1.id, {}, isDoubleDatabase);

        return result;
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const quotation = await this.Model1.create(quotationData, {
          transaction: transaction1,
        });

        if (categoriesData && categoriesData.length > 0) {
          await this._syncQuotationCategories(
            quotation.id,
            categoriesData,
            transaction1,
            null,
            false
          );
        }

        await transaction1.commit();
        console.log(`✅ Quotation created in DB1 only`);

        const result = await this.getById(quotation.id, {}, false);
        return result;
      }
    } catch (error) {
      console.error(
        `❌ Error creating Quotation with nested relations:`,
        error.message
      );
      console.error(`❌ Error stack:`, error.stack);

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(`Failed to create Quotation: ${error.message}`);
    }
  }

  /**
   * Update quotation with nested categories, services, products, and fields
   * @param {Number} id - Quotation ID
   * @param {Object} quotationData - Quotation data to update
   * @param {Array} categoriesData - Array of quotation categories
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Object} Updated quotation with nested relations
   */
  async updateWithNested(
    id,
    quotationData,
    categoriesData = [],
    isDoubleDatabase = true
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Updating Quotation ID ${id} with nested relations...`);

        // 1. Update Quotation in both databases
        const [updatedRows1] = await this.Model1.update(quotationData, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(quotationData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`Quotation with ID ${id} not found`);
        }

        console.log(`✅ Updated Quotation in both databases`);

        // 2. Sync Quotation Categories with nested relations
        await this._syncQuotationCategories(
          id,
          categoriesData,
          transaction1,
          transaction2,
          isDoubleDatabase
        );

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Quotation with nested relations successfully updated`);

        // Get updated quotation
        const result = await this.getById(id, {}, isDoubleDatabase);
        return result;
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const [updatedRows] = await this.Model1.update(quotationData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`Quotation with ID ${id} not found`);
        }

        await this._syncQuotationCategories(
          id,
          categoriesData,
          transaction1,
          null,
          false
        );

        await transaction1.commit();
        console.log(`✅ Quotation updated in DB1 only`);

        const result = await this.getById(id, {}, false);
        return result;
      }
    } catch (error) {
      console.error(
        `❌ Error updating Quotation with nested relations:`,
        error.message
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(`Failed to update Quotation: ${error.message}`);
    }
  }

  /**
   * Sync Quotation Categories with nested services and products
   * @private
   */
  async _syncQuotationCategories(
    quotationId,
    categoriesData,
    transaction1,
    transaction2,
    isDoubleDatabase
  ) {
    // Prepare categories data
    const preparedCategories = categoriesData.map((cat) => {
      const { services, products, ...categoryData } = cat;
      return {
        ...categoryData,
        id_quotation: quotationId,
      };
    });

    // Sync Categories
    const categoriesResult = await syncChildRecords({
      Model1: models.db1.QuotationCategory,
      Model2: isDoubleDatabase ? models.db2.QuotationCategory : null,
      foreignKey: "id_quotation",
      parentId: quotationId,
      newData: preparedCategories,
      transaction1,
      transaction2,
      isDoubleDatabase,
    });

    // Extract actual records from result (created + updated)
    const syncedCategories = [
      ...(categoriesResult.created || []),
      ...(categoriesResult.updated || []),
    ];

    console.log(
      `📦 Synced ${syncedCategories.length} categories (${categoriesResult.summary.totalCreated} created, ${categoriesResult.summary.totalUpdated} updated)`
    );

    // Get IDs of categories that will be kept
    const keepCategoryIds = syncedCategories.map((cat) => cat.id);

    // Find categories that will be deleted (exist in DB but not in keepCategoryIds)
    const existingCategories = await models.db1.QuotationCategory.findAll({
      where: { id_quotation: quotationId },
      attributes: ["id"],
      transaction: transaction1,
    });

    const existingCategoryIds = existingCategories.map((cat) => cat.id);
    const deletedCategoryIds = existingCategoryIds.filter(
      (id) => !keepCategoryIds.includes(id)
    );

    // Delete child records for categories that will be deleted
    if (deletedCategoryIds.length > 0) {
      console.log(
        `🗑️ Cleaning up ${deletedCategoryIds.length} categories and their children...`
      );

      // Get products that belong to categories being deleted
      const productsToDelete = await models.db1.QuotationProduct.findAll({
        where: { id_quotation_category: deletedCategoryIds },
        attributes: ["id"],
        transaction: transaction1,
      });

      const productIdsToDelete = productsToDelete.map((p) => p.id);

      // Delete fields first (deepest child)
      if (productIdsToDelete.length > 0) {
        await models.db1.QuotationProductField.destroy({
          where: { id_quotation_product: productIdsToDelete },
          transaction: transaction1,
        });

        if (isDoubleDatabase) {
          await models.db2.QuotationProductField.destroy({
            where: { id_quotation_product: productIdsToDelete },
            transaction: transaction2,
          });
        }
        console.log(
          `   ✓ Deleted fields for ${productIdsToDelete.length} products`
        );
      }

      // Delete products
      await models.db1.QuotationProduct.destroy({
        where: { id_quotation_category: deletedCategoryIds },
        transaction: transaction1,
      });

      if (isDoubleDatabase) {
        await models.db2.QuotationProduct.destroy({
          where: { id_quotation_category: deletedCategoryIds },
          transaction: transaction2,
        });
      }

      // Delete services
      await models.db1.QuotationService.destroy({
        where: { id_quotation_category: deletedCategoryIds },
        transaction: transaction1,
      });

      if (isDoubleDatabase) {
        await models.db2.QuotationService.destroy({
          where: { id_quotation_category: deletedCategoryIds },
          transaction: transaction2,
        });
      }

      console.log(
        `   ✓ Cleaned up products and services for deleted categories`
      );
    }

    // Create a map to link categoriesData with syncedCategories by ID
    // For items with ID: match by ID
    // For items without ID: match by order in created array
    const categoryMapping = new Map();

    let createdIndex = 0;
    for (let i = 0; i < categoriesData.length; i++) {
      const categoryData = categoriesData[i];

      if (categoryData.id) {
        // Find in synced categories by ID
        const syncedCategory = syncedCategories.find(
          (sc) => sc.id === categoryData.id
        );
        if (syncedCategory) {
          categoryMapping.set(i, syncedCategory);
        }
      } else {
        // Match with created categories in order
        const createdCategories = categoriesResult.created || [];
        if (createdIndex < createdCategories.length) {
          categoryMapping.set(i, createdCategories[createdIndex]);
          createdIndex++;
        }
      }
    }

    // Process each category's nested data
    for (let i = 0; i < categoriesData.length; i++) {
      const categoryData = categoriesData[i];
      const syncedCategory = categoryMapping.get(i);

      if (!syncedCategory || !syncedCategory.id) {
        console.warn(`⚠️ Category at index ${i} was not synced properly`);
        continue;
      }

      const categoryId = syncedCategory.id;
      console.log(`🔄 Processing nested data for category ID: ${categoryId}`);

      // Sync Services for this category
      if (
        categoryData.services &&
        Array.isArray(categoryData.services) &&
        categoryData.services.length > 0
      ) {
        const servicesData = categoryData.services.map((service) => ({
          ...service,
          id_quotation_category: categoryId,
        }));

        console.log(
          `📝 Syncing ${servicesData.length} services for category ${categoryId}`
        );

        const servicesResult = await syncChildRecords({
          Model1: models.db1.QuotationService,
          Model2: isDoubleDatabase ? models.db2.QuotationService : null,
          foreignKey: "id_quotation_category",
          parentId: categoryId,
          newData: servicesData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        const syncedServicesCount =
          (servicesResult.created?.length || 0) +
          (servicesResult.updated?.length || 0);
        console.log(
          `✅ Synced ${syncedServicesCount} services for category ${categoryId}`
        );
      } else {
        // If no services provided, delete all existing services
        await models.db1.QuotationService.destroy({
          where: { id_quotation_category: categoryId },
          transaction: transaction1,
        });

        if (isDoubleDatabase) {
          await models.db2.QuotationService.destroy({
            where: { id_quotation_category: categoryId },
            transaction: transaction2,
          });
        }
      }

      // Sync Products for this category
      if (
        categoryData.products &&
        Array.isArray(categoryData.products) &&
        categoryData.products.length > 0
      ) {
        const productsData = categoryData.products.map((product) => {
          const { fields, ...productData } = product;
          return {
            ...productData,
            id_quotation_category: categoryId,
          };
        });

        console.log(
          `📦 Syncing ${productsData.length} products for category ${categoryId}`
        );

        // Get existing products to identify which will be deleted
        const existingProducts = await models.db1.QuotationProduct.findAll({
          where: { id_quotation_category: categoryId },
          attributes: ["id"],
          transaction: transaction1,
        });

        const keepProductIds = productsData
          .filter((p) => p.id)
          .map((p) => p.id);
        const existingProductIds = existingProducts.map((p) => p.id);
        const deletedProductIds = existingProductIds.filter(
          (id) => !keepProductIds.includes(id)
        );

        // Delete fields for products that will be deleted
        if (deletedProductIds.length > 0) {
          console.log(
            `🗑️ Deleting fields for ${deletedProductIds.length} products...`
          );

          await models.db1.QuotationProductField.destroy({
            where: { id_quotation_product: deletedProductIds },
            transaction: transaction1,
          });

          if (isDoubleDatabase) {
            await models.db2.QuotationProductField.destroy({
              where: { id_quotation_product: deletedProductIds },
              transaction: transaction2,
            });
          }
        }

        const productsResult = await syncChildRecords({
          Model1: models.db1.QuotationProduct,
          Model2: isDoubleDatabase ? models.db2.QuotationProduct : null,
          foreignKey: "id_quotation_category",
          parentId: categoryId,
          newData: productsData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        // Create mapping for products similar to categories
        const syncedProducts = [
          ...(productsResult.created || []),
          ...(productsResult.updated || []),
        ];

        console.log(
          `✅ Synced ${syncedProducts.length} products for category ${categoryId}`
        );

        const productMapping = new Map();
        let productCreatedIndex = 0;

        for (let j = 0; j < categoryData.products.length; j++) {
          const productData = categoryData.products[j];

          if (productData.id) {
            const syncedProduct = syncedProducts.find(
              (sp) => sp.id === productData.id
            );
            if (syncedProduct) {
              productMapping.set(j, syncedProduct);
            }
          } else {
            const createdProducts = productsResult.created || [];
            if (productCreatedIndex < createdProducts.length) {
              productMapping.set(j, createdProducts[productCreatedIndex]);
              productCreatedIndex++;
            }
          }
        }

        // Sync Fields for each product
        for (let j = 0; j < categoryData.products.length; j++) {
          const productData = categoryData.products[j];
          const syncedProduct = productMapping.get(j);

          if (!syncedProduct || !syncedProduct.id) {
            console.warn(
              `⚠️ Product at index ${j} in category ${categoryId} was not synced properly`
            );
            continue;
          }

          const productId = syncedProduct.id;

          if (
            productData.fields &&
            Array.isArray(productData.fields) &&
            productData.fields.length > 0
          ) {
            const fieldsData = productData.fields.map((field) => ({
              ...field,
              id_quotation_product: productId,
            }));

            console.log(
              `🔧 Syncing ${fieldsData.length} fields for product ${productId}`
            );

            const fieldsResult = await syncChildRecords({
              Model1: models.db1.QuotationProductField,
              Model2: isDoubleDatabase
                ? models.db2.QuotationProductField
                : null,
              foreignKey: "id_quotation_product",
              parentId: productId,
              newData: fieldsData,
              transaction1,
              transaction2,
              isDoubleDatabase,
            });

            const syncedFieldsCount =
              (fieldsResult.created?.length || 0) +
              (fieldsResult.updated?.length || 0);
            console.log(
              `✅ Synced ${syncedFieldsCount} fields for product ${productId}`
            );
          } else {
            // If no fields provided, delete all existing fields
            await models.db1.QuotationProductField.destroy({
              where: { id_quotation_product: productId },
              transaction: transaction1,
            });

            if (isDoubleDatabase) {
              await models.db2.QuotationProductField.destroy({
                where: { id_quotation_product: productId },
                transaction: transaction2,
              });
            }
          }
        }
      } else {
        // If no products provided, delete all existing products and their fields
        const existingProducts = await models.db1.QuotationProduct.findAll({
          where: { id_quotation_category: categoryId },
          attributes: ["id"],
          transaction: transaction1,
        });

        const productIds = existingProducts.map((p) => p.id);

        if (productIds.length > 0) {
          await models.db1.QuotationProductField.destroy({
            where: { id_quotation_product: productIds },
            transaction: transaction1,
          });

          if (isDoubleDatabase) {
            await models.db2.QuotationProductField.destroy({
              where: { id_quotation_product: productIds },
              transaction: transaction2,
            });
          }
        }

        await models.db1.QuotationProduct.destroy({
          where: { id_quotation_category: categoryId },
          transaction: transaction1,
        });

        if (isDoubleDatabase) {
          await models.db2.QuotationProduct.destroy({
            where: { id_quotation_category: categoryId },
            transaction: transaction2,
          });
        }
      }
    }

    return syncedCategories;
  }
}

module.exports = new QuotationService();
