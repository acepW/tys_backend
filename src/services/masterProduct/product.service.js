const DualDatabaseService = require("../dualDatabase.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");

class ProductService extends DualDatabaseService {
  constructor() {
    super("Product");
  }

  /**
   * Get all products with category and sub-category
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Products with relations
   */
  async getAllWithRelations(isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const options = {
      include: [
        {
          model: dbModels.ProductFields,
          as: "product_fields",
          attributes: ["id", "field_name"],
        },
        {
          model: dbModels.Category,
          as: "category",
          attributes: ["id", "category_name"],
        },
        {
          model: dbModels.SubCategory,
          as: "subCategory",
          attributes: ["id", "sub_category_name"],
        },
      ],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  async getById(id, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const options = {
      include: [
        {
          model: dbModels.Category,
          as: "category",
          attributes: ["id", "category_name"],
        },
        {
          model: dbModels.SubCategory,
          as: "subCategory",
          attributes: ["id", "sub_category_name"],
        },
      ],
    };

    return await this.findById(id, options, isDoubleDatabase);
  }

  /**
   * Get products by category
   * @param {Number} categoryId
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Products
   */
  async getByCategory(categoryId, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const options = {
      where: { id_category: categoryId },
      include: [
        {
          model: dbModels.SubCategory,
          as: "subCategory",
          attributes: ["id", "sub_category_name"],
        },
      ],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Get products by sub-category
   * @param {Number} subCategoryId
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Products
   */
  async getBySubCategory(subCategoryId, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const options = {
      where: { id_sub_category: subCategoryId },
      include: [
        {
          model: dbModels.Category,
          as: "category",
          attributes: ["id", "category_name"],
        },
      ],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Create product with validation
   * @param {Object} data
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Created product
   */
  async createWithValidation(data, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    // Validate category exists
    const category = await dbModels.Category.findByPk(data.id_category);
    if (!category) {
      throw new Error("Category not found");
    }

    // Validate sub-category exists and belongs to the category
    const subCategory = await dbModels.SubCategory.findByPk(
      data.id_sub_category
    );
    if (!subCategory) {
      throw new Error("Sub-category not found");
    }

    if (subCategory.id_category !== data.id_category) {
      throw new Error("Sub-category does not belong to the selected category");
    }

    return await this.create(data, isDoubleDatabase);
  }

  /**
   * Create product with fields in a single transaction
   * Supports create, update, and delete of product fields
   *
   * @param {Object} productData - Product data
   * @param {Array} fieldsData - Product fields data
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Object} Created product with fields operation result
   */
  async createWithFields(
    productData,
    fieldsData = [],
    isDoubleDatabase = true
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        let fieldsResultFilter = [];

        console.log(`🔄 Creating Product with fields in both databases...`);

        // 1. Create Product in DB1
        const product1 = await this.Model1.create(productData, {
          transaction: transaction1,
        });
        console.log(`✅ Created Product in DB1 with ID: ${product1.id}`);

        // 2. Create Product in DB2 with same ID
        const productDataWithId = { ...productData, id: product1.id };
        await this.Model2.create(productDataWithId, {
          transaction: transaction2,
        });
        console.log(`✅ Created Product in DB2 with ID: ${product1.id}`);

        for (let index = 0; index < fieldsData.length; index++) {
          const e = fieldsData[index];
          fieldsResultFilter.push({ ...e, id_product: product1.id });
        }

        // 3. Sync Product Fields (Create/Update/Delete)
        const fieldsResult = await syncChildRecords({
          Model1: models.db1.ProductFields,
          Model2: models.db2.ProductFields,
          foreignKey: "id_product",
          parentId: product1.id,
          newData: fieldsResultFilter,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Product with fields successfully created`);

        return {
          product: product1.toJSON(),
          fields: fieldsResult,
        };
      } else {
        // Single database (DB2 only)
        transaction2 = await db2.transaction();

        let fieldsResultFilter = [];

        const product = await this.Model2.create(productData, {
          transaction: transaction2,
        });

        for (let index = 0; index < fieldsData.length; index++) {
          const e = fieldsData[index];
          fieldsResultFilter.push({ ...e, id_product: product1.id });
        }

        const fieldsResult = await syncChildRecords({
          Model1: null,
          Model2: models.db2.ProductFields,
          foreignKey: "id_product",
          parentId: product.id,
          newData: fieldsResultFilter,
          transaction1: null,
          transaction2,
          isDoubleDatabase: false,
        });

        await transaction2.commit();
        console.log(`✅ Product with fields created in DB2 only`);

        return {
          product: product.toJSON(),
          fields: fieldsResult,
        };
      }
    } catch (error) {
      console.error(`❌ Error creating Product with fields:`, error.message);

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(`Failed to create Product with fields: ${error.message}`);
    }
  }

  /**
   * Update product with fields in a single transaction
   * Supports create, update, and delete of product fields
   *
   * @param {Number} id - Product ID
   * @param {Object} productData - Product data to update
   * @param {Array} fieldsData - Product fields data
   * @param {Boolean} isDoubleDatabase - Hit both databases if true
   * @returns {Object} Updated product with fields operation result
   */
  async updateWithFields(
    id,
    productData,
    fieldsData = [],
    isDoubleDatabase = true
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Updating Product ID ${id} with fields...`);

        // 1. Update Product in both databases
        const [updatedRows1] = await this.Model1.update(productData, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(productData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`Product with ID ${id} not found`);
        }

        console.log(`✅ Updated Product in both databases`);

        // 2. Sync Product Fields (Create/Update/Delete)
        const fieldsResult = await syncChildRecords({
          Model1: models.db1.ProductFields,
          Model2: models.db2.ProductFields,
          foreignKey: "id_product",
          parentId: id,
          newData: fieldsData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Product with fields successfully updated`);

        // Get updated product
        const updated = await this.Model1.findByPk(id);

        return {
          product: updated ? updated.toJSON() : null,
          fields: fieldsResult,
        };
      } else {
        // Single database (DB2 only)
        transaction2 = await db2.transaction();

        const [updatedRows] = await this.Model2.update(productData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows === 0) {
          throw new Error(`Product with ID ${id} not found`);
        }

        const fieldsResult = await syncChildRecords({
          Model1: null,
          Model2: models.db2.ProductFields,
          foreignKey: "id_product",
          parentId: id,
          newData: fieldsData,
          transaction1: null,
          transaction2,
          isDoubleDatabase: false,
        });

        await transaction2.commit();
        console.log(`✅ Product with fields updated in DB2 only`);

        const updated = await this.Model2.findByPk(id);

        return {
          product: updated ? updated.toJSON() : null,
          fields: fieldsResult,
        };
      }
    } catch (error) {
      console.error(`❌ Error updating Product with fields:`, error.message);

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(`Failed to update Product with fields: ${error.message}`);
    }
  }

  /**
   * Search products by name
   * @param {String} searchTerm
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Matching products
   */
  async searchByName(searchTerm, isDoubleDatabase = true) {
    const { Op } = require("sequelize");
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const options = {
      where: {
        [Op.or]: [
          { product_name_indo: { [Op.like]: `%${searchTerm}%` } },
          { product_name_mandarin: { [Op.like]: `%${searchTerm}%` } },
        ],
      },
      include: [
        {
          model: dbModels.Category,
          as: "category",
          attributes: ["id", "category_name"],
        },
        {
          model: dbModels.SubCategory,
          as: "subCategory",
          attributes: ["id", "sub_category_name"],
        },
      ],
    };

    return await this.findAll(options, isDoubleDatabase);
  }

  /**
   * Get low stock products
   * @param {Number} threshold
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Low stock products
   */
  async getLowStock(threshold = 10, isDoubleDatabase = true) {
    const { Op } = require("sequelize");

    const options = {
      where: {
        qty: { [Op.lte]: threshold },
        is_active: true,
      },
      order: [["qty", "ASC"]],
    };

    return await this.findAll(options, isDoubleDatabase);
  }
}

module.exports = new ProductService();
