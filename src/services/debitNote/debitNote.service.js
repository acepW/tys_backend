const DualDatabaseService = require("../dualDatabase.service");
const companyService = require("../company.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");
const { Op, fn, col } = require("sequelize");
const incomingDebitNoteService = require("./incomingDebitNote.service");

class DebitNoteService extends DualDatabaseService {
  constructor() {
    super("DebitNote");
  }

  async _nextSharedId(Model1, Model2, transaction1, transaction2) {
    const [maxId1, maxId2] = await Promise.all([
      Model1.max("id", { transaction: transaction1 }),
      Model2.max("id", { transaction: transaction2 }),
    ]);
    return Math.max(Number(maxId1 || 0), Number(maxId2 || 0)) + 1;
  }

  /**
   * Get all debit notes with relations
   * @param {Object} options - Query options
   * @param {Number} page - Page number for pagination
   * @param {Number} limit - Number of records per page
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Debit notes with relations
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
          model: dbModels.Quotation,
          as: "quotation",
          attributes: [
            "id",
            "quotation_no",
            "quotation_title_indo",
            "quotation_title_mandarin",
          ],
        },
        {
          model: dbModels.Contract,
          as: "contract",
          attributes: [
            "id",
            "contract_no",
            "contract_title_indo",
            "contract_title_mandarin",
          ],
        },
        {
          model: dbModels.PreOrder,
          as: "pre_order",
        },
        {
          model: dbModels.ContractPayment,
          as: "contract_payment",
        },
        {
          model: dbModels.PreOrderPayment,
          as: "pre_order_payment",
        },
        {
          model: dbModels.Invoice,
          as: "invoices",
          attributes: ["id", "invoice_no", "date", "total"],
        },
        {
          model: dbModels.Company,
          as: "company",
          attributes: ["id", "company_name", "initial_company"],
        },
        {
          model: dbModels.Customer,
          as: "customer",
          attributes: ["id", "company_name_indo", "company_name_mandarin"],
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
        {
          model: dbModels.User,
          as: "user_paid",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.DebitNoteItem,
          as: "debit_note_items",
          separate: true,
        },
        {
          model: dbModels.DebitNoteVerificationProgress,
          as: "verification_progress",
          separate: true,
          include: [
            {
              model: dbModels.User,
              as: "user",
              attributes: ["id", "name", "email"],
              include: [
                { model: dbModels.Department, as: "department" },
                { model: dbModels.Position, as: "position" },
              ],
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    };

    if (!page || !limit) {
      return await this.findAll(queryOptions, isDoubleDatabase);
    }

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
   * Get debit note by ID with relations
   * @param {Number} id
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Debit note with relations
   */
  async getById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.Quotation,
          as: "quotation",
        },
        {
          model: dbModels.Contract,
          as: "contract",
        },
        {
          model: dbModels.PreOrder,
          as: "pre_order",
        },
        {
          model: dbModels.ContractPayment,
          as: "contract_payment",
        },
        {
          model: dbModels.PreOrderPayment,
          as: "pre_order_payment",
        },
        {
          model: dbModels.Invoice,
          as: "invoices",
        },
        {
          model: dbModels.Company,
          as: "company",
        },
        {
          model: dbModels.Customer,
          as: "customer",
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
        {
          model: dbModels.User,
          as: "user_paid",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.DebitNoteItem,
          as: "debit_note_items",
          separate: true,
        },
        {
          model: dbModels.DebitNoteVerificationProgress,
          as: "verification_progress",
          separate: true,
          include: [
            {
              model: dbModels.User,
              as: "user",
              attributes: ["id", "name", "email"],
              include: [
                { model: dbModels.Department, as: "department" },
                { model: dbModels.Position, as: "position" },
              ],
            },
          ],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Get no Debit Note
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Debit Note with relations
   */
  async getNoDebitNote(isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // 🔥 1. Ambil total per company
    const dataTotal = await dbModels.DebitNote.findAll({
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

      const noQuotation = `${nomorUrut}/DN/${initial}/${bulanRomawi}/${year}`;

      return {
        id_company: company.id,
        company_name: company.company_name,
        initial_company: initial,
        total,
        next_number: nomorUrut,
        no_debit_note: noQuotation,
      };
    });

    return result;
  }

  /**
   * Create debit note with debit note items
   * @param {Object} debitNoteData - Debit note data
   * @param {Array} debitNoteItems - Debit note items data
   * @param {Number} id_user_create - User ID who creates the debit note
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Created debit note with all relations
   */
  async createWithRelations(
    debitNoteData,
    debitNoteItems = [],
    id_user_create,
    isDoubleDatabase = true,
    externalTransaction1 = null,
    externalTransaction2 = null,
  ) {
    // Jika external transaction dikirim, pakai itu. Jika tidak, buat baru.
    const isExternalTransaction = !!externalTransaction1;

    let transaction1 = externalTransaction1;
    let transaction2 = externalTransaction2;

    try {
      if (isDoubleDatabase) {
        if (!isExternalTransaction) {
          transaction1 = await db1.transaction();
          transaction2 = await db2.transaction();
        }

        console.log(`🔄 Creating DebitNote with items in both databases...`);

        // 1. Create DebitNote in DB1
        const debitNote1 = await this.Model1.create(debitNoteData, {
          transaction: transaction1,
        });
        console.log(`✅ Created DebitNote in DB1 with ID: ${debitNote1.id}`);

        // 2. Create DebitNote in DB2 with same ID
        const debitNoteDataWithId = { ...debitNoteData, id: debitNote1.id };
        await this.Model2.create(debitNoteDataWithId, {
          transaction: transaction2,
        });
        console.log(`✅ Created DebitNote in DB2 with ID: ${debitNote1.id}`);

        // 3. Sync DebitNote Items
        const itemsData = debitNoteItems.map((item) => ({
          ...item,
          id_debit_note: debitNote1.id,
        }));

        const itemsResult = await syncChildRecords({
          Model1: models.db1.DebitNoteItem,
          Model2: models.db2.DebitNoteItem,
          foreignKey: "id_debit_note",
          parentId: debitNote1.id,
          newData: itemsData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        const progressData = {
          id_debit_note: debitNote1.id,
          id_user: id_user_create,
          status: "created",
          note: "Debit note created",
        };
        const progress1 = await models.db1.DebitNoteVerificationProgress.create(
          progressData,
          {
            transaction: transaction1,
          },
        );
        await models.db2.DebitNoteVerificationProgress.create(
          { ...progressData, id: progress1.id },
          { transaction: transaction2 },
        );

        console.log(
          `✅ Synced ${itemsResult.created?.length || 0} DebitNote Items`,
        );

        if (!isExternalTransaction) {
          await transaction1.commit();
          await transaction2.commit();
          console.log(`✅ DebitNote with all relations successfully created`);
        }
        console.log(`✅ DebitNote with all relations successfully created`);

        return {
          debit_note: debitNote1.toJSON(),
          debit_note_items: itemsResult,
          verification_progress: progress1.toJSON(),
        };
      } else {
        // Single database (DB1 only)
        if (!isExternalTransaction) {
          transaction1 = await db1.transaction();
        }

        const debitNote = await this.Model1.create(debitNoteData, {
          transaction: transaction1,
        });
        console.log(`✅ Created DebitNote in DB1 with ID: ${debitNote.id}`);

        const itemsData = debitNoteItems.map((item) => ({
          ...item,
          id_debit_note: debitNote.id,
        }));

        const itemsResult = await syncChildRecords({
          Model1: models.db1.DebitNoteItem,
          Model2: null,
          foreignKey: "id_debit_note",
          parentId: debitNote.id,
          newData: itemsData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        const progressData = {
          id_debit_note: debitNote.id,
          id_user: id_user_create,
          status: "created",
          note: "Debit note created",
        };
        const progress = await models.db1.DebitNoteVerificationProgress.create(
          progressData,
          {
            transaction: transaction1,
          },
        );

        console.log(
          `✅ Synced ${itemsResult.created?.length || 0} DebitNote Items`,
        );

        if (!isExternalTransaction) {
          await transaction1.commit();
          console.log(`✅ DebitNote created in DB1 only`);
        }
        console.log(`✅ DebitNote created in DB1 only`);

        return {
          debit_note: debitNote.toJSON(),
          debit_note_items: itemsResult,
          verification_progress: progress.toJSON(),
        };
      }
    } catch (error) {
      console.error(`❌ Error creating DebitNote:`, error.message);
      if (!isExternalTransaction) {
        if (transaction1) await transaction1.rollback();
        if (transaction2) await transaction2.rollback();
      }
      throw new Error(`Failed to create DebitNote: ${error.message}`);
    }
  }

  /**
   * Create a debit note from one or more incoming payment-list records.
   * The existing manual createWithRelations flow remains unchanged.
   */
  async createFromIncoming(
    debitNoteData,
    incomingDebitNoteIds,
    idUserCreate,
    isDoubleDatabase = true,
    externalTransaction1 = null,
    externalTransaction2 = null,
  ) {
    const ownsTransaction = !externalTransaction1;
    let transaction1 = externalTransaction1;
    let transaction2 = externalTransaction2;

    try {
      const uniqueIds = [...new Set(incomingDebitNoteIds.map(Number))];
      if (ownsTransaction) {
        transaction1 = await db1.transaction();
        if (isDoubleDatabase) transaction2 = await db2.transaction();
      } else if (isDoubleDatabase && !transaction2) {
        throw new Error(
          "Both database transactions are required for combined creation",
        );
      }

      const incomingRows = await models.db1.IncomingDebitNote.findAll({
        where: {
          id: uniqueIds,
          status: "incoming",
          is_active: true,
        },
        transaction: transaction1,
        lock: transaction1.LOCK.UPDATE,
      });

      if (incomingRows.length !== uniqueIds.length) {
        const error = new Error(
          "One or more incoming debit note items are not found or already used",
        );
        error.statusCode = 409;
        throw error;
      }

      const sources = incomingRows.map((row) => row.toJSON());
      const sourceTypes = [...new Set(sources.map((row) => row.source_type))];
      if (sourceTypes.length !== 1) {
        const error = new Error(
          "All incoming debit note items must have the same source type",
        );
        error.statusCode = 400;
        throw error;
      }

      const sourceType = sourceTypes[0];
      const paymentField =
        sourceType === "contract"
          ? "id_contract_payment"
          : "id_pre_order_payment";
      const paymentIds = [...new Set(sources.map((row) => row[paymentField]))];
      if (paymentIds.length !== 1) {
        const error = new Error(
          "All incoming debit note items must belong to the same payment",
        );
        error.statusCode = 400;
        throw error;
      }

      const paymentId = paymentIds[0];
      let payment;
      let document;
      let paymentLists;

      if (sourceType === "contract") {
        const listIds = sources.map((row) => row.id_contract_payment_list);
        payment = await models.db1.ContractPayment.findByPk(paymentId, {
          include: [
            {
              model: models.db1.Contract,
              as: "contract",
              required: true,
            },
            {
              model: models.db1.ContractPaymentList,
              as: "contract_payment_list",
              required: true,
              where: {
                id: listIds,
                payment_purpose: "debit note",
                is_active: true,
              },
              include: [
                {
                  model: models.db1.ContractPaymentService,
                  as: "contract_payment_services",
                  include: [
                    {
                      model: models.db1.QuotationService,
                      as: "quotation_service",
                      required: true,
                    },
                  ],
                },
              ],
            },
          ],
          transaction: transaction1,
        });
        document = payment?.contract;
        paymentLists = payment?.contract_payment_list || [];
      } else {
        const listIds = sources.map((row) => row.id_pre_order_payment_list);
        payment = await models.db1.PreOrderPayment.findByPk(paymentId, {
          include: [
            {
              model: models.db1.PreOrder,
              as: "pre_order",
              required: true,
            },
            {
              model: models.db1.PreOrderPaymentList,
              as: "pre_order_payment_list",
              required: true,
              where: {
                id: listIds,
                payment_purpose: "debit note",
                is_active: true,
              },
              include: [
                {
                  model: models.db1.PreOrderPaymentService,
                  as: "pre_order_payment_services",
                  include: [
                    {
                      model: models.db1.PreOrderService,
                      as: "pre_order_service",
                      required: true,
                    },
                  ],
                },
              ],
            },
          ],
          transaction: transaction1,
        });
        document = payment?.pre_order;
        paymentLists = payment?.pre_order_payment_list || [];
      }

      if (
        !payment ||
        !payment.is_open ||
        paymentLists.length !== uniqueIds.length
      ) {
        const error = new Error(
          "Payment is closed or one or more payment lists are invalid",
        );
        error.statusCode = 409;
        throw error;
      }

      const allocateAmount = (total, weights, index) => {
        const numericTotal = Number(total || 0);
        const normalizedWeights = weights.map((weight) => Number(weight || 0));
        const totalWeight = normalizedWeights.reduce(
          (sum, weight) => sum + weight,
          0,
        );
        const effectiveWeights =
          totalWeight > 0 ? normalizedWeights : normalizedWeights.map(() => 1);
        const effectiveTotal = effectiveWeights.reduce(
          (sum, weight) => sum + weight,
          0,
        );
        if (index === effectiveWeights.length - 1) {
          const allocatedBefore = effectiveWeights
            .slice(0, index)
            .reduce(
              (sum, weight) =>
                sum + Math.floor((numericTotal * weight) / effectiveTotal),
              0,
            );
          return numericTotal - allocatedBefore;
        }
        return Math.floor(
          (numericTotal * effectiveWeights[index]) / effectiveTotal,
        );
      };

      const debitNoteItems = [];
      for (const paymentList of paymentLists) {
        const links =
          sourceType === "contract"
            ? paymentList.contract_payment_services
            : paymentList.pre_order_payment_services;
        if (!links || links.length === 0) {
          const error = new Error(
            `Payment list ${paymentList.id} does not have any services`,
          );
          error.statusCode = 400;
          throw error;
        }

        const sourceServices = links.map((link) =>
          sourceType === "contract"
            ? link.quotation_service
            : link.pre_order_service,
        );
        const idrWeights = sourceServices.map(
          (service) => service.total_price_idr,
        );
        const rmbWeights = sourceServices.map(
          (service) => service.total_price_rmb,
        );

        links.forEach((link, index) => {
          const sourceService = sourceServices[index];
          const qty = Math.max(Number(sourceService.qty) || 1, 1);
          const totalIdr = allocateAmount(
            paymentList.price_idr,
            idrWeights,
            index,
          );
          const totalRmb = allocateAmount(
            paymentList.price_rmb,
            rmbWeights,
            index,
          );
          debitNoteItems.push({
            product_name_indo: sourceService.product_name_indo,
            product_name_mandarin: sourceService.product_name_mandarin,
            price_idr: Math.round(totalIdr / qty),
            price_rmb: Math.round(totalRmb / qty),
            qty,
            total_price_idr: totalIdr,
            total_price_rmb: totalRmb,
            payment_type: paymentList.payment_type,
            is_active: true,
          });
        });
      }

      const useRmb = payment.currency_type === "rmb";
      const subTotal = paymentLists.reduce(
        (sum, list) =>
          sum + Number(useRmb ? list.price_rmb || 0 : list.price_idr || 0),
        0,
      );
      const ppn = debitNoteData.tax_ppn ? Math.round(subTotal * 0.11) : 0;
      const pph = debitNoteData.tax_pph_23 ? Math.round(subTotal * 0.02) : 0;
      const dataToCreate = {
        date: debitNoteData.date,
        debit_note_no: debitNoteData.debit_note_no,
        tax_ppn: debitNoteData.tax_ppn === true,
        tax_pph_23: debitNoteData.tax_pph_23 === true,
        note: debitNoteData.note || "",
        source_type: sourceType,
        id_quotation: document.id_quotation,
        id_contract:
          sourceType === "contract" ? document.id : document.id_contract,
        id_pre_order: sourceType === "pre_order" ? document.id : null,
        id_contract_payment: sourceType === "contract" ? paymentId : null,
        id_pre_order_payment: sourceType === "pre_order" ? paymentId : null,
        id_company: document.id_company,
        id_customer: document.id_customer,
        id_user_create: idUserCreate,
        currency_type: payment.currency_type,
        status: "pending",
        is_active: true,
        sub_total: subTotal,
        ppn,
        pph,
        total: subTotal + ppn - pph,
      };

      if (isDoubleDatabase) {
        dataToCreate.id = await this._nextSharedId(
          models.db1.DebitNote,
          models.db2.DebitNote,
          transaction1,
          transaction2,
        );
      }
      const debitNote1 = await models.db1.DebitNote.create(dataToCreate, {
        transaction: transaction1,
      });
      if (isDoubleDatabase) {
        await models.db2.DebitNote.create(dataToCreate, {
          transaction: transaction2,
        });
      }

      let nextItemId = null;
      if (isDoubleDatabase && debitNoteItems.length > 0) {
        nextItemId = await this._nextSharedId(
          models.db1.DebitNoteItem,
          models.db2.DebitNoteItem,
          transaction1,
          transaction2,
        );
      }
      for (const item of debitNoteItems) {
        const itemData = { ...item, id_debit_note: debitNote1.id };
        if (isDoubleDatabase) {
          itemData.id = nextItemId;
          nextItemId += 1;
        }
        await models.db1.DebitNoteItem.create(itemData, {
          transaction: transaction1,
        });
        if (isDoubleDatabase) {
          await models.db2.DebitNoteItem.create(itemData, {
            transaction: transaction2,
          });
        }
      }

      const progressData = {
        id_debit_note: debitNote1.id,
        id_user: idUserCreate,
        status: "created",
        note: "Debit note created from incoming payment list",
      };
      if (isDoubleDatabase) {
        progressData.id = await this._nextSharedId(
          models.db1.DebitNoteVerificationProgress,
          models.db2.DebitNoteVerificationProgress,
          transaction1,
          transaction2,
        );
      }
      await models.db1.DebitNoteVerificationProgress.create(progressData, {
        transaction: transaction1,
      });
      if (isDoubleDatabase) {
        await models.db2.DebitNoteVerificationProgress.create(progressData, {
          transaction: transaction2,
        });
      }

      await incomingDebitNoteService.markAsHistory(
        uniqueIds,
        debitNote1.id,
        isDoubleDatabase,
        transaction1,
        transaction2,
      );

      if (ownsTransaction) {
        await transaction1.commit();
        if (transaction2) await transaction2.commit();
        return await this.getById(debitNote1.id, {}, isDoubleDatabase);
      }

      return {
        debit_note: debitNote1.toJSON(),
        debit_note_items: debitNoteItems,
      };
    } catch (error) {
      if (ownsTransaction) {
        if (transaction1 && !transaction1.finished) {
          await transaction1.rollback();
        }
        if (transaction2 && !transaction2.finished) {
          await transaction2.rollback();
        }
      }
      throw error;
    }
  }

  /**
   * Update debit note with debit note items (create/update/delete)
   * @param {Number} id - Debit note ID
   * @param {Object} debitNoteData - Debit note data to update
   * @param {Array} debitNoteItems - Debit note items data
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated debit note with all relations
   */
  async updateWithRelations(
    id,
    debitNoteData,
    debitNoteItems = [],
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Updating DebitNote ID ${id} with items...`);

        // 1. Update DebitNote in both databases
        const [updatedRows1] = await this.Model1.update(debitNoteData, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(debitNoteData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`DebitNote with ID ${id} not found`);
        }

        console.log(`✅ Updated DebitNote in both databases`);

        // 2. Sync DebitNote Items (syncChildRecords handles create/update/delete)
        const itemsData = debitNoteItems.map((item) => ({
          ...item,
          id_debit_note: id,
        }));

        const itemsResult = await syncChildRecords({
          Model1: models.db1.DebitNoteItem,
          Model2: models.db2.DebitNoteItem,
          foreignKey: "id_debit_note",
          parentId: id,
          newData: itemsData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        console.log(`✅ Synced DebitNote Items`);

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ DebitNote with all relations successfully updated`);

        return await this.getById(id, {}, isDoubleDatabase);
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const [updatedRows] = await this.Model1.update(debitNoteData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`DebitNote with ID ${id} not found`);
        }

        const itemsData = debitNoteItems.map((item) => ({
          ...item,
          id_debit_note: id,
        }));

        const itemsResult = await syncChildRecords({
          Model1: models.db1.DebitNoteItem,
          Model2: null,
          foreignKey: "id_debit_note",
          parentId: id,
          newData: itemsData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        await transaction1.commit();
        console.log(`✅ DebitNote updated in DB1 only`);

        return await this.getById(id, {}, isDoubleDatabase);
      }
    } catch (error) {
      console.error(`❌ Error updating DebitNote:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to update DebitNote: ${error.message}`);
    }
  }

  /**
   * Submit debit note - change status to "on verification"
   * @param {Number} id - Debit note ID
   * @param {String} note - Note for submission
   * @param {Number} id_user - User ID who submits
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated debit note
   */
  async submitDebitNote(id, note, id_user, isDoubleDatabase = true) {
    return await this._changeStatus(
      id,
      "on verification",
      note || "Debit note submitted",
      id_user,
      isDoubleDatabase,
    );
  }

  /**
   * Approve debit note
   * @param {Number} id - Debit note ID
   * @param {String} note - Note for approval
   * @param {Number} id_user - User ID who approves
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated debit note
   */
  async approveDebitNote(id, note, id_user, isDoubleDatabase = true) {
    return await this._changeStatus(
      id,
      "approved",
      note || "Debit note approved",
      id_user,
      isDoubleDatabase,
    );
  }

  /**
   * Reject debit note
   * @param {Number} id - Debit note ID
   * @param {String} note - Note for rejection
   * @param {Number} id_user - User ID who rejects
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated debit note
   */
  async rejectDebitNote(id, note, id_user, isDoubleDatabase = true) {
    return await this._changeStatus(
      id,
      "rejected",
      note || "Debit note rejected",
      id_user,
      isDoubleDatabase,
    );
  }

  /**
   * Pay debit note - change status to "paid off" and add progress
   * @param {Number} id - Debit note ID
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated debit note
   */
  async payDebitNote(
    id,
    note,
    payment_date,
    payment_amount,
    payment_method,
    proof_of_payment,
    id_user,
    isDoubleDatabase = true,
  ) {
    return await this._changeStatus(
      id,
      "paid",
      note || "Debit note paid",
      id_user,
      isDoubleDatabase,
      payment_date,
      payment_amount,
      payment_method,
      proof_of_payment,
    );
  }

  /**
   * Internal method to change debit note status
   * @param {Number} id - Debit note ID
   * @param {String} status - New status
   * @param {String} note - Note for the status change
   * @param {Number} id_user - User ID performing the action
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated debit note
   */
  async _changeStatus(
    id,
    status,
    note,
    id_user,
    isDoubleDatabase = true,
    payment_date,
    payment_amount,
    payment_method,
    proof_of_payment,
  ) {
    let transaction1 = null;
    let transaction2 = null;
    const progressStatus = status === "on verification" ? "submitted" : status;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Changing DebitNote ID ${id} status to "${status}"...`);

        // Prepare update data
        const updateData = { status };
        if (note) updateData.note = note;
        if (status === "approved") updateData.id_user_approve = id_user;
        if (status === "rejected") updateData.id_user_reject = id_user;

        if (status == "paid") {
          updateData.payment_date = payment_date;
          updateData.payment_amount = payment_amount;
          updateData.payment_method = payment_method;
          updateData.proof_of_payment = proof_of_payment;
          updateData.id_user_paid = id_user;
        }

        // Update DebitNote status in both databases
        const [updatedRows1] = await this.Model1.update(updateData, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(updateData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`DebitNote with ID ${id} not found`);
        }

        const progressData = {
          id_debit_note: id,
          id_user,
          status: progressStatus,
          note,
        };
        const progress1 = await models.db1.DebitNoteVerificationProgress.create(
          progressData,
          {
            transaction: transaction1,
          },
        );
        await models.db2.DebitNoteVerificationProgress.create(
          { ...progressData, id: progress1.id },
          { transaction: transaction2 },
        );

        const getDataDebitNote = await this.getById(id, {}, isDoubleDatabase);
        if (!getDataDebitNote) {
          throw new Error(`DebitNote with ID ${id} not found`);
        }

        if (getDataDebitNote.id_payment_request) {
          // Handle payment request
          await models.db1.PaymentRequest.update(
            {
              payment_method: payment_method,
              total_payment: payment_amount,
              file_proof_payment: proof_of_payment,
              status: "paid",
            },
            {
              where: { id: getDataDebitNote.id_payment_request },
              transaction: transaction1,
            },
          );

          await models.db2.PaymentRequest.update(
            {
              payment_method: payment_method,
              total_payment: payment_amount,
              file_proof_payment: proof_of_payment,
              status: "paid",
            },
            {
              where: { id: getDataDebitNote.id_payment_request },
              transaction: transaction2,
            },
          );

          console.log(`✅ Update PaymentRequest with status "paid"`);
        }

        console.log(`✅ Updated DebitNote status in both databases`);

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ DebitNote status successfully changed to "${status}"`);

        return await this.getById(id, {}, isDoubleDatabase);
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const updateData = { status };
        if (note) updateData.note = note;
        if (status === "approved") updateData.id_user_approve = id_user;
        if (status === "rejected") updateData.id_user_reject = id_user;

        const [updatedRows] = await this.Model1.update(updateData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`DebitNote with ID ${id} not found`);
        }

        await models.db1.DebitNoteVerificationProgress.create(
          {
            id_debit_note: id,
            id_user,
            status: progressStatus,
            note,
          },
          { transaction: transaction1 },
        );

        await transaction1.commit();
        console.log(`✅ DebitNote status changed to "${status}" in DB1 only`);

        return await this.getById(id, {}, isDoubleDatabase);
      }
    } catch (error) {
      console.error(`❌ Error changing DebitNote status:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to change DebitNote status: ${error.message}`);
    }
  }
}

module.exports = new DebitNoteService();
