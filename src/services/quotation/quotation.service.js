const DualDatabaseService = require("../dualDatabase.service");
const companyService = require("../company.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");
const { Op, fn, col } = require("sequelize");

class QuotationService extends DualDatabaseService {
  constructor() {
    super("Quotation");
  }

  /**
   * Get all quotations with relations
   * @param {Object} options - Query options
   * @param {Number} page - Page number for pagination
   * @param {Number} limit - Number of records per page
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Quotations with relations
   */
  async getAllWithRelations(
    options = {},
    page = null,
    limit = null,
    isDoubleDatabase = true,
  ) {
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
        {
          model: dbModels.QuotationPayment,
          as: "quotation_payment",
        },
        {
          model: dbModels.User,
          as: "user_create",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_approve",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_reject",
          attributes: ["id", "name", "email"],
        },
      ],
    };

    //if page and limit not set, use normal findAll
    if (!page || !limit) {
      return await this.findAll(queryOptions, isDoubleDatabase);
    }

    //if page and limit are set, use pagination
    const offset = (page - 1) * limit;
    const { count, rows } = await this.findAndCountAll(
      { ...queryOptions, limit, offset },
      isDoubleDatabase,
    );

    return {
      data: rows,
      pagination: {
        total_data: count,
        total_page: Math.ceil(count / limit),
        current_page: page,
        per_page: limit,
      },
    };
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
              include: [
                {
                  model: dbModels.FlowProcess,
                  as: "flow_process",
                  required: false,
                  where: { is_active: true },
                },
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
        {
          model: dbModels.QuotationPayment,
          as: "quotation_payment",
          include: [
            {
              model: dbModels.QuotationPaymentList,
              as: "quotation_payment_list",
              include: [
                {
                  model: dbModels.QuotationPaymentService,
                  as: "quotation_payment_services",
                },
              ],
            },
          ],
        },
        {
          model: dbModels.User,
          as: "user_create",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_approve",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_reject",
          attributes: ["id", "name", "email"],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Get no quotation
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Quotation with relations
   */
  async getNoQuotation(isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // 🔥 1. Ambil total per company
    const dataTotal = await dbModels.Quotation.findAll({
      attributes: ["id_company", [fn("COUNT", col("id")), "total"]],
      where: {
        is_active: true,
        createdAt: {
          [Op.gte]: new Date(`${year}-01-01`),
          [Op.lt]: new Date(`${year + 1}-01-01`),
        },
      },
      group: ["id_company"],
      raw: true,
    });

    // 🔥 2. Ambil data company
    const dataCompany = await companyService.findAll(
      {
        attributes: ["id", "company_name", "initial_company"],
      },
      isDoubleDatabase,
    );

    // 🔥 function bulan romawi
    function getRomanMonth(month) {
      const romans = [
        "I",
        "II",
        "III",
        "IV",
        "V",
        "VI",
        "VII",
        "VIII",
        "IX",
        "X",
        "XI",
        "XII",
      ];
      return romans[month - 1];
    }

    const bulanRomawi = getRomanMonth(month);

    // 🔥 3. Merge + format nomor
    const result = dataCompany.map((company) => {
      const found = dataTotal.find((d) => d.id_company === company.id);

      const total = found ? parseInt(found.total) : 0;
      const nomorUrut = String(total + 1).padStart(3, "0");

      const initial = company.initial_company
        ? company.initial_company.toUpperCase()
        : "-";

      const noQuotation = `${nomorUrut}/QT/${initial}/${bulanRomawi}/${year}`;

      return {
        id_company: company.id,
        company_name: company.company_name,
        initial_company: initial,
        total,
        next_number: nomorUrut,
        no_quotation: noQuotation,
      };
    });

    return result;
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
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Creating Quotation with nested relations in both databases...`,
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
            `🔄 Starting to sync ${categoriesData.length} categories...`,
          );
          const syncedCategories = await this._syncQuotationCategories(
            quotation1.id,
            categoriesData,
            transaction1,
            transaction2,
            isDoubleDatabase,
          );
          console.log(
            `✅ Categories sync completed: ${syncedCategories.length} categories processed`,
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
            false,
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
        error.message,
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
    isDoubleDatabase = true,
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
          isDoubleDatabase,
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
          false,
        );

        await transaction1.commit();
        console.log(`✅ Quotation updated in DB1 only`);

        const result = await this.getById(id, {}, false);
        return result;
      }
    } catch (error) {
      console.error(
        `❌ Error updating Quotation with nested relations:`,
        error.message,
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(`Failed to update Quotation: ${error.message}`);
    }
  }

  /**
   * Sync payments (array) with nested payment lists and payment services
   * Logic: no id = create, has id = update, missing from data = delete
   * @param {Number} quotationId
   * @param {Array} paymentsData - Array of payment with nested lists & services
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Payments with nested relations
   */
  async syncPayment(quotationId, paymentsData = [], isDoubleDatabase = true) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      transaction1 = await db1.transaction();
      if (isDoubleDatabase) transaction2 = await db2.transaction();

      console.log(
        `🔄 Syncing ${paymentsData.length} Payment(s) for Quotation ID: ${quotationId}...`,
      );

      // ── 1. Sync QuotationPayment (array) via syncChildRecords ───────
      const preparedPayments = paymentsData.map((payment) => {
        const { payment_list, ...paymentData } = payment;
        return { ...paymentData, id_quotation: quotationId };
      });

      const paymentsResult = await syncChildRecords({
        Model1: models.db1.QuotationPayment,
        Model2: isDoubleDatabase ? models.db2.QuotationPayment : null,
        foreignKey: "id_quotation",
        parentId: quotationId,
        newData: preparedPayments,
        transaction1,
        transaction2,
        isDoubleDatabase,
      });

      const syncedPayments = [
        ...(paymentsResult.created || []),
        ...(paymentsResult.updated || []),
      ];

      console.log(
        `📦 Synced ${syncedPayments.length} payment(s) ` +
          `(${paymentsResult.summary.totalCreated} created, ${paymentsResult.summary.totalUpdated} updated)`,
      );

      // Cleanup lists & services milik payment yang dihapus
      const keepPaymentIds = syncedPayments.map((p) => p.id);
      const existingPayments = await models.db1.QuotationPayment.findAll({
        where: { id_quotation: quotationId },
        attributes: ["id"],
        transaction: transaction1,
      });
      const deletedPaymentIds = existingPayments
        .map((p) => p.id)
        .filter((id) => !keepPaymentIds.includes(id));

      if (deletedPaymentIds.length > 0) {
        console.log(
          `🗑️ Cleaning up lists & services for ${deletedPaymentIds.length} deleted payment(s)...`,
        );

        // Ambil list ids yang akan ikut terhapus
        const listsToDelete = await models.db1.QuotationPaymentList.findAll({
          where: { id_quotation_payment: deletedPaymentIds },
          attributes: ["id"],
          transaction: transaction1,
        });
        const deletedListIds = listsToDelete.map((l) => l.id);

        // Hapus services dulu (terdalam)
        if (deletedListIds.length > 0) {
          await models.db1.QuotationPaymentService.destroy({
            where: { id_quotation_payment_list: deletedListIds },
            transaction: transaction1,
          });

          if (isDoubleDatabase) {
            await models.db2.QuotationPaymentService.destroy({
              where: { id_quotation_payment_list: deletedListIds },
              transaction: transaction2,
            });
          }
        }

        // Hapus lists
        await models.db1.QuotationPaymentList.destroy({
          where: { id_quotation_payment: deletedPaymentIds },
          transaction: transaction1,
        });

        if (isDoubleDatabase) {
          await models.db2.QuotationPaymentList.destroy({
            where: { id_quotation_payment: deletedPaymentIds },
            transaction: transaction2,
          });
        }

        console.log(`   ✓ Cleaned up lists and services for deleted payments`);
      }

      // ── 2. Map paymentsData → syncedPayments ────────────────────────
      const paymentMapping = new Map();
      let paymentCreatedIndex = 0;

      for (let i = 0; i < paymentsData.length; i++) {
        const paymentData = paymentsData[i];

        if (paymentData.id) {
          const synced = syncedPayments.find((sp) => sp.id === paymentData.id);
          if (synced) paymentMapping.set(i, synced);
        } else {
          const createdPayments = paymentsResult.created || [];
          if (paymentCreatedIndex < createdPayments.length) {
            paymentMapping.set(i, createdPayments[paymentCreatedIndex]);
            paymentCreatedIndex++;
          }
        }
      }

      // ── 3. Sync QuotationPaymentList per payment ────────────────────
      for (let i = 0; i < paymentsData.length; i++) {
        const paymentData = paymentsData[i];
        const syncedPayment = paymentMapping.get(i);

        if (!syncedPayment?.id) {
          console.warn(`⚠️ Payment at index ${i} was not synced properly`);
          continue;
        }

        const paymentId = syncedPayment.id;
        const paymentListData = paymentData.payment_list || [];

        console.log(
          `🔄 Processing ${paymentListData.length} list(s) for Payment ID: ${paymentId}`,
        );

        if (paymentListData.length > 0) {
          const preparedLists = paymentListData.map((list) => {
            const { services, ...listData } = list;
            return { ...listData, id_quotation_payment: paymentId };
          });

          const listsResult = await syncChildRecords({
            Model1: models.db1.QuotationPaymentList,
            Model2: isDoubleDatabase ? models.db2.QuotationPaymentList : null,
            foreignKey: "id_quotation_payment",
            parentId: paymentId,
            newData: preparedLists,
            transaction1,
            transaction2,
            isDoubleDatabase,
          });

          const syncedLists = [
            ...(listsResult.created || []),
            ...(listsResult.updated || []),
          ];

          console.log(
            `✅ Synced ${syncedLists.length} list(s) for Payment ID: ${paymentId} ` +
              `(${listsResult.summary.totalCreated} created, ${listsResult.summary.totalUpdated} updated)`,
          );

          // Cleanup services milik list yang dihapus
          const keepListIds = syncedLists.map((l) => l.id);
          const existingLists = await models.db1.QuotationPaymentList.findAll({
            where: { id_quotation_payment: paymentId },
            attributes: ["id"],
            transaction: transaction1,
          });
          const deletedListIds = existingLists
            .map((l) => l.id)
            .filter((id) => !keepListIds.includes(id));

          if (deletedListIds.length > 0) {
            await models.db1.QuotationPaymentService.destroy({
              where: { id_quotation_payment_list: deletedListIds },
              transaction: transaction1,
            });

            if (isDoubleDatabase) {
              await models.db2.QuotationPaymentService.destroy({
                where: { id_quotation_payment_list: deletedListIds },
                transaction: transaction2,
              });
            }

            console.log(
              `   🗑️ Cleaned up services for ${deletedListIds.length} deleted list(s)`,
            );
          }

          // ── 4. Map paymentListData → syncedLists ───────────────────
          const listMapping = new Map();
          let listCreatedIndex = 0;

          for (let j = 0; j < paymentListData.length; j++) {
            const listData = paymentListData[j];

            if (listData.id) {
              const synced = syncedLists.find((sl) => sl.id === listData.id);
              if (synced) listMapping.set(j, synced);
            } else {
              const createdLists = listsResult.created || [];
              if (listCreatedIndex < createdLists.length) {
                listMapping.set(j, createdLists[listCreatedIndex]);
                listCreatedIndex++;
              }
            }
          }

          // ── 5. Sync QuotationPaymentService per list ───────────────
          for (let j = 0; j < paymentListData.length; j++) {
            const listData = paymentListData[j];
            const syncedList = listMapping.get(j);

            if (!syncedList?.id) {
              console.warn(
                `⚠️ PaymentList at index ${j} in Payment ${paymentId} was not synced properly`,
              );
              continue;
            }

            const listId = syncedList.id;
            const services = listData.services || [];

            if (services.length > 0) {
              const preparedServices = services.map((svc) => ({
                ...svc,
                id_quotation_payment: paymentId,
                id_quotation_payment_list: listId,
              }));

              const servicesResult = await syncChildRecords({
                Model1: models.db1.QuotationPaymentService,
                Model2: isDoubleDatabase
                  ? models.db2.QuotationPaymentService
                  : null,
                foreignKey: "id_quotation_payment_list",
                parentId: listId,
                newData: preparedServices,
                transaction1,
                transaction2,
                isDoubleDatabase,
              });

              const syncedCount =
                (servicesResult.created?.length || 0) +
                (servicesResult.updated?.length || 0);

              console.log(
                `✅ Synced ${syncedCount} service(s) for PaymentList ID: ${listId} ` +
                  `(${servicesResult.summary.totalCreated} created, ${servicesResult.summary.totalUpdated} updated)`,
              );
            } else {
              // Tidak ada services → hapus semua yang ada
              await models.db1.QuotationPaymentService.destroy({
                where: { id_quotation_payment_list: listId },
                transaction: transaction1,
              });

              if (isDoubleDatabase) {
                await models.db2.QuotationPaymentService.destroy({
                  where: { id_quotation_payment_list: listId },
                  transaction: transaction2,
                });
              }

              console.log(
                `🗑️ Cleared all services for PaymentList ID: ${listId}`,
              );
            }
          }
        } else {
          // Tidak ada list → hapus semua list & services yang ada
          const existingLists = await models.db1.QuotationPaymentList.findAll({
            where: { id_quotation_payment: paymentId },
            attributes: ["id"],
            transaction: transaction1,
          });
          const existingListIds = existingLists.map((l) => l.id);

          if (existingListIds.length > 0) {
            await models.db1.QuotationPaymentService.destroy({
              where: { id_quotation_payment_list: existingListIds },
              transaction: transaction1,
            });

            if (isDoubleDatabase) {
              await models.db2.QuotationPaymentService.destroy({
                where: { id_quotation_payment_list: existingListIds },
                transaction: transaction2,
              });
            }

            await models.db1.QuotationPaymentList.destroy({
              where: { id_quotation_payment: paymentId },
              transaction: transaction1,
            });

            if (isDoubleDatabase) {
              await models.db2.QuotationPaymentList.destroy({
                where: { id_quotation_payment: paymentId },
                transaction: transaction2,
              });
            }

            console.log(
              `🗑️ Cleared all lists & services for Payment ID: ${paymentId}`,
            );
          }
        }
      }

      // ── Commit ──────────────────────────────────────────────────────
      await transaction1.commit();
      if (isDoubleDatabase) await transaction2.commit();

      console.log(`✅ Payment sync completed for Quotation ID: ${quotationId}`);

      return await this.getById(quotationId, {}, isDoubleDatabase);
    } catch (error) {
      console.error(`❌ Error syncing Payment:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to sync Payment: ${error.message}`);
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
    isDoubleDatabase,
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
      `📦 Synced ${syncedCategories.length} categories (${categoriesResult.summary.totalCreated} created, ${categoriesResult.summary.totalUpdated} updated)`,
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
      (id) => !keepCategoryIds.includes(id),
    );

    // Delete child records for categories that will be deleted
    if (deletedCategoryIds.length > 0) {
      console.log(
        `🗑️ Cleaning up ${deletedCategoryIds.length} categories and their children...`,
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
          `   ✓ Deleted fields for ${productIdsToDelete.length} products`,
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
        `   ✓ Cleaned up products and services for deleted categories`,
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
          (sc) => sc.id === categoryData.id,
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
          `📝 Syncing ${servicesData.length} services for category ${categoryId}`,
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
          `✅ Synced ${syncedServicesCount} services for category ${categoryId}`,
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
          `📦 Syncing ${productsData.length} products for category ${categoryId}`,
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
          (id) => !keepProductIds.includes(id),
        );

        // Delete fields for products that will be deleted
        if (deletedProductIds.length > 0) {
          console.log(
            `🗑️ Deleting fields for ${deletedProductIds.length} products...`,
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
          `✅ Synced ${syncedProducts.length} products for category ${categoryId}`,
        );

        const productMapping = new Map();
        let productCreatedIndex = 0;

        for (let j = 0; j < categoryData.products.length; j++) {
          const productData = categoryData.products[j];

          if (productData.id) {
            const syncedProduct = syncedProducts.find(
              (sp) => sp.id === productData.id,
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
              `⚠️ Product at index ${j} in category ${categoryId} was not synced properly`,
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
              `🔧 Syncing ${fieldsData.length} fields for product ${productId}`,
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
              `✅ Synced ${syncedFieldsCount} fields for product ${productId}`,
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
