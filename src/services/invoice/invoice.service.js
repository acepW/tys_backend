const DualDatabaseService = require("../dualDatabase.service");
const companyService = require("../company.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");
const { Op, fn, col, where } = require("sequelize");
const debitNoteService = require("../debitNote/debitNote.service");
const incomingInvoiceService = require("./incomingInvoice.service");
const taxService = require("../masterTax/tax.service");

class InvoiceService extends DualDatabaseService {
  constructor() {
    super("Invoice");
  }
  async _nextSharedId(Model1, Model2, transaction1, transaction2) {
    const [maxId1, maxId2] = await Promise.all([
      Model1.max("id", { transaction: transaction1 }),
      Model2.max("id", { transaction: transaction2 }),
    ]);

    return Math.max(Number(maxId1 || 0), Number(maxId2 || 0)) + 1;
  }

  /**
   * Get all invoices with relations
   * @param {Object} options - Query options
   * @param {Number} page - Page number for pagination
   * @param {Number} limit - Number of records per page
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Invoices with relations
   */
  async getAllWithRelations(
    options = {},
    page = null,
    limit = null,
    isDoubleDatabase = true,
    search = null,
  ) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;
    let resolvedOptions = options;

    if (search) {
      const searchPattern = `%${search}%`;
      const [matchingContracts, matchingPreOrders] = await Promise.all([
        dbModels.Contract.findAll({
          attributes: ["id"],
          where: { contract_no: { [Op.like]: searchPattern } },
          raw: true,
        }),
        dbModels.PreOrder.findAll({
          attributes: ["id"],
          where: { pre_order_no: { [Op.like]: searchPattern } },
          raw: true,
        }),
      ]);
      const contractIds = matchingContracts.map((contract) => contract.id);
      const preOrderIds = matchingPreOrders.map((preOrder) => preOrder.id);
      const searchConditions = [
        { invoice_no: { [Op.like]: searchPattern } },
        { note: { [Op.like]: searchPattern } },
      ];

      if (contractIds.length > 0) {
        searchConditions.push({ id_contract: { [Op.in]: contractIds } });
      }
      if (preOrderIds.length > 0) {
        searchConditions.push({ id_pre_order: { [Op.in]: preOrderIds } });
      }

      resolvedOptions = {
        ...options,
        where: {
          [Op.and]: [options.where || {}, { [Op.or]: searchConditions }],
        },
      };
    }

    const queryOptions = {
      ...resolvedOptions,
      include: [
        {
          model: dbModels.Quotation,
          as: "quotation",
          attributes: [
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
          required: false,
        },
        {
          model: dbModels.ContractPayment,
          as: "contract_payment",
          attributes: [
            "id",
            "payment_time_indo",
            "payment_time_mandarin",
            "total_payment_idr",
            "total_payment_rmb",
            "payment_to",
          ],
        },
        {
          model: dbModels.PreOrderPayment,
          as: "pre_order_payment",
          required: false,
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
          model: dbModels.InvoiceService,
          as: "invoice_services",
          separate: true,
          include: [
            {
              model: dbModels.QuotationService,
              as: "quotation_service",
            },
          ],
        },
        {
          model: dbModels.InvoiceVerificationProgress,
          as: "verification_progress",
          separate: true,
          include: [
            {
              model: dbModels.User,
              as: "user",
              attributes: ["id", "name", "email"],
              include: [
                {
                  model: dbModels.Department,
                  as: "department",
                },
                {
                  model: dbModels.Position,
                  as: "position",
                },
              ],
            },
          ],
        },
        {
          model: dbModels.DebitNote,
          as: "debit_note",
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
   * Get invoice by ID with relations
   * @param {Number} id
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Invoice with relations
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
          required: false,
        },
        {
          model: dbModels.ContractPayment,
          as: "contract_payment",
        },
        {
          model: dbModels.PreOrderPayment,
          as: "pre_order_payment",
          required: false,
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
          model: dbModels.InvoiceService,
          as: "invoice_services",
          include: [
            {
              model: dbModels.QuotationService,
              as: "quotation_service",
            },
          ],
        },
        {
          model: dbModels.InvoiceVerificationProgress,
          as: "verification_progress",
          separate: true,
          include: [
            {
              model: dbModels.User,
              as: "user",
              attributes: ["id", "name", "email"],
              include: [
                {
                  model: dbModels.Department,
                  as: "department",
                },
                {
                  model: dbModels.Position,
                  as: "position",
                },
              ],
            },
          ],
        },
        {
          model: dbModels.DebitNote,
          as: "debit_note",
          include: [
            {
              model: dbModels.Company,
              as: "company",
              attributes: ["id", "company_name"],
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
              model: dbModels.DebitNoteItem,
              as: "debit_note_items",
              separate: true,
            },
          ],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Get no Invoice
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Invoice with relations
   */
  async getNoInvoice(isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // 🔥 1. Ambil total per company
    const dataTotal = await dbModels.Invoice.findAll({
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

      const noQuotation = `${nomorUrut}/INV/${initial}/${bulanRomawi}/${year}`;

      return {
        id_company: company.id,
        company_name: company.company_name,
        initial_company: initial,
        total,
        next_number: nomorUrut,
        no_invoice: noQuotation,
      };
    });

    return result;
  }

  /**
   * Create invoice with invoice services
   * @param {Object} invoiceData - Invoice data
   * @param {Array} invoiceServices - Invoice services data
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Created invoice with all relations
   */
  async createWithRelations(
    invoiceData,
    invoiceServices = [],
    id_user_create,
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      //get data for debit note
      const getNoDebitNote = await debitNoteService.getNoDebitNote(true);
      const noDebitNote = getNoDebitNote.find(
        (item) => item.id_company === invoiceData.id_company,
      );

      const dataContractPayment = await models.db1.ContractPayment.findByPk(
        invoiceData.id_contract_payment,
        {
          include: [
            {
              model: models.db1.ContractPaymentList,
              as: "contract_payment_list",
              include: [
                {
                  model: models.db1.ContractPaymentService,
                  as: "contract_payment_services",
                  attributes: ["id", "id_quotation_service"],
                  include: [
                    {
                      model: models.db1.QuotationService,
                      as: "quotation_service",
                      include: [
                        {
                          model: models.db1.ServicePricing,
                          as: "service_pricing",
                          attributes: [
                            "id",
                            "product_name_indo",
                            "product_name_mandarin",
                            "processing_time",
                          ],
                          include: [
                            {
                              model: models.db1.ProjectPlan,
                              as: "project_plans",
                              include: [
                                {
                                  model: models.db1.ProjectPlanCost,
                                  as: "project_plan_costs",
                                  where: { cost_bearer: "customer" },
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      );

      //formating debit note
      const today = new Date().toISOString().split("T")[0];

      // Kumpulkan semua debit_note_items dari project_plan_costs
      const debitNoteItems = [];

      for (const paymentList of dataContractPayment.contract_payment_list) {
        const paymentType = paymentList.payment_type; // "dp" | "pelunasan" | "full"

        for (const paymentService of paymentList.contract_payment_services) {
          const servicePricing =
            paymentService.quotation_service?.service_pricing;

          if (!servicePricing) continue;

          for (const projectPlan of servicePricing.project_plans) {
            for (const cost of projectPlan.project_plan_costs) {
              // Hitung harga berdasarkan payment_type
              let priceIdr = cost.price_idr;
              let priceRmb = cost.price_rmb;

              if (paymentType === "dp" || paymentType === "pelunasan") {
                priceIdr = priceIdr / 2;
                priceRmb = priceRmb / 2;
              }
              // "full" → langsung pakai nilai asli

              debitNoteItems.push({
                product_name_indo: cost.cost_description_indo,
                product_name_mandarin: cost.cost_description_mandarin,
                price_idr: priceIdr,
                price_rmb: priceRmb,
                qty: 1,
                total_price_idr: priceIdr,
                total_price_rmb: priceRmb,
                payment_type: paymentType,
              });
            }
          }
        }
      }

      // Hitung subtotal dari semua item (pakai IDR)
      const subTotal = debitNoteItems.reduce(
        (sum, item) => sum + item.total_price_idr,
        0,
      );

      // Hitung pajak menggunakan persentase dari master pajak.
      const { ppn, pph } = await taxService.calculate(
        subTotal,
        invoiceData.tax_ppn,
        invoiceData.tax_pph_23,
      );
      const total = subTotal + ppn - pph;

      // Bentuk output akhir
      const debitNotePayload = {
        is_double_database: true,
        id_quotation: invoiceData.id_quotation,
        id_contract: invoiceData.id_contract,
        id_company: invoiceData.id_company,
        id_customer: invoiceData.id_customer,
        debit_note_no: noDebitNote?.no_debit_note,
        date: today,
        tax_ppn: invoiceData.tax_ppn,
        tax_pph_23: invoiceData.tax_pph_23,
        sub_total: subTotal,
        ppn: ppn,
        pph: pph,
        total: total,
        note: invoiceData.note,
        debit_note_items: debitNoteItems,
      };
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Creating Invoice with services in both databases...`);

        const CreateDebitNote = await debitNoteService.createWithRelations(
          debitNotePayload,
          debitNotePayload.debit_note_items,
          id_user_create,
          true,
          transaction1,
          transaction2,
        );

        const invoiceDataFormat = {
          ...invoiceData,
          id_debit_note: CreateDebitNote.debit_note.id,
        };

        // 1. Create Invoice in DB1
        const invoice1 = await this.Model1.create(invoiceDataFormat, {
          transaction: transaction1,
        });
        console.log(`✅ Created Invoice in DB1 with ID: ${invoice1.id}`);

        // 2. Create Invoice in DB2 with same ID
        const invoiceDataWithId = { ...invoiceDataFormat, id: invoice1.id };
        await this.Model2.create(invoiceDataWithId, {
          transaction: transaction2,
        });
        console.log(`✅ Created Invoice in DB2 with ID: ${invoice1.id}`);

        // 3. Sync Invoice Services
        const servicesData = invoiceServices.map((service) => ({
          ...service,
          id_invoice: invoice1.id,
        }));

        const servicesResult = await syncChildRecords({
          Model1: models.db1.InvoiceService,
          Model2: models.db2.InvoiceService,
          foreignKey: "id_invoice",
          parentId: invoice1.id,
          newData: servicesData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        console.log(
          `✅ Synced ${servicesResult.created?.length || 0} Invoice Services`,
        );

        // 4. Create initial InvoiceVerificationProgress with status "created"
        const progressData = {
          id_invoice: invoice1.id,
          id_user: id_user_create,
          status: "created",
          note: "Invoice created",
        };

        const progress1 = await models.db1.InvoiceVerificationProgress.create(
          progressData,
          { transaction: transaction1 },
        );

        const progressDataWithId = {
          ...progressData,
          id: progress1.id,
        };
        await models.db2.InvoiceVerificationProgress.create(
          progressDataWithId,
          {
            transaction: transaction2,
          },
        );

        console.log(
          `✅ Created ContractVerificationProgress with status "created"`,
        );

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Invoice with all relations successfully created`);

        return {
          invoice: invoice1.toJSON(),
          invoice_services: servicesResult,
          verification_progress: progress1.toJSON(),
        };
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const CreateDebitNote = await debitNoteService.createWithRelations(
          debitNotePayload,
          debitNotePayload.debit_note_items,
          id_user_create,
          false,
          transaction1,
          null,
        );
        const invoiceDataFormat = {
          ...invoiceData,
          id_debit_note: CreateDebitNote.debit_note.id,
        };

        const invoice = await this.Model1.create(invoiceDataFormat, {
          transaction: transaction1,
        });

        const servicesData = invoiceServices.map((service) => ({
          ...service,
          id_invoice: invoice.id,
        }));

        const servicesResult = await syncChildRecords({
          Model1: models.db1.InvoiceService,
          Model2: null,
          foreignKey: "id_invoice",
          parentId: invoice.id,
          newData: servicesData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        // 4. Create initial InvoiceVerificationProgress with status "created"
        const progressData = {
          id_invoice: invoice.id,
          id_user: id_user_create,
          status: "created",
          note: "Invoice created",
        };

        const progress = await models.db1.InvoiceVerificationProgress.create(
          progressData,
          { transaction: transaction1 },
        );

        console.log(
          `✅ Created InvoiceVerificationProgress with status "created"`,
        );

        await transaction1.commit();
        console.log(`✅ Invoice created in DB1 only`);

        return {
          invoice: invoice.toJSON(),
          invoice_services: servicesResult,
          verification_progress: progress.toJSON(),
        };
      }
    } catch (error) {
      console.error(`❌ Error creating Invoice:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to create Invoice: ${error.message}`);
    }
  }

  /**
   * Create an invoice from one or more incoming payment-list records.
   */
  async createFromIncoming(
    invoiceData,
    incomingInvoiceIds,
    idUserCreate,
    isDoubleDatabase = true,
    incomingDebitNoteIds = [],
    debitNoteData = null,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      const uniqueIds = [...new Set(incomingInvoiceIds.map(Number))];
      transaction1 = await db1.transaction();
      if (isDoubleDatabase) transaction2 = await db2.transaction();

      const incomingRows = await models.db1.IncomingInvoice.findAll({
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
          "One or more incoming invoice items are not found or already used",
        );
        error.statusCode = 409;
        throw error;
      }

      const sources = incomingRows.map((row) => row.toJSON());
      const sourceTypes = [...new Set(sources.map((row) => row.source_type))];
      if (sourceTypes.length !== 1) {
        const error = new Error(
          "All incoming invoice items must have the same source type",
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
          "All incoming invoice items must belong to the same payment",
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
                payment_purpose: "invoice",
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
                payment_purpose: "invoice",
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

      let createdDebitNote = null;
      if (incomingDebitNoteIds.length > 0) {
        const debitNoteResult = await debitNoteService.createFromIncoming(
          {
            date: debitNoteData?.date || invoiceData.date,
            debit_note_no: debitNoteData?.debit_note_no,
            tax_ppn:
              debitNoteData?.tax_ppn !== undefined
                ? debitNoteData.tax_ppn
                : invoiceData.tax_ppn,
            tax_pph_23:
              debitNoteData?.tax_pph_23 !== undefined
                ? debitNoteData.tax_pph_23
                : invoiceData.tax_pph_23,
            note:
              debitNoteData?.note !== undefined
                ? debitNoteData.note
                : invoiceData.note,
          },
          incomingDebitNoteIds,
          idUserCreate,
          isDoubleDatabase,
          transaction1,
          transaction2,
        );
        createdDebitNote = debitNoteResult.debit_note;

        const debitNotePaymentId =
          sourceType === "contract"
            ? createdDebitNote.id_contract_payment
            : createdDebitNote.id_pre_order_payment;
        if (
          createdDebitNote.source_type !== sourceType ||
          Number(debitNotePaymentId) !== Number(paymentId)
        ) {
          const error = new Error(
            "Incoming invoice and debit note items must belong to the same source and payment",
          );
          error.statusCode = 400;
          throw error;
        }
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
      const invoiceServices = [];

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

          invoiceServices.push({
            id_quotation_service:
              sourceType === "contract"
                ? link.id_quotation_service
                : sourceService.id_quotation_service,
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
      const { ppn, pph } = await taxService.calculate(
        subTotal,
        invoiceData.tax_ppn,
        invoiceData.tax_pph_23,
        transaction1,
      );
      const dataToCreate = {
        date: invoiceData.date,
        due_date: invoiceData.due_date || null,
        invoice_no: invoiceData.invoice_no,
        tax_ppn: invoiceData.tax_ppn === true,
        tax_pph_23: invoiceData.tax_pph_23 === true,
        note: invoiceData.note || "",
        file_invoice: invoiceData.file_invoice || null,
        source_type: sourceType,
        id_quotation: document.id_quotation,
        id_contract:
          sourceType === "contract" ? document.id : document.id_contract,
        id_pre_order: sourceType === "pre_order" ? document.id : null,
        id_contract_payment: sourceType === "contract" ? paymentId : null,
        id_pre_order_payment: sourceType === "pre_order" ? paymentId : null,
        id_company: document.id_company,
        id_customer: document.id_customer,
        id_debit_note: createdDebitNote?.id || null,
        id_user_create: idUserCreate,
        currency_type: payment.currency_type,
        status: "pending",
        is_active: true,
        sub_total: subTotal,
        ppn,
        pph,
        total: subTotal + ppn - pph,
      };

      const invoiceDataWithSharedId = { ...dataToCreate };
      if (isDoubleDatabase) {
        invoiceDataWithSharedId.id = await this._nextSharedId(
          models.db1.Invoice,
          models.db2.Invoice,
          transaction1,
          transaction2,
        );
      }

      const invoice1 = await models.db1.Invoice.create(
        invoiceDataWithSharedId,
        { transaction: transaction1 },
      );
      if (isDoubleDatabase) {
        await models.db2.Invoice.create(invoiceDataWithSharedId, {
          transaction: transaction2,
        });
      }

      let nextInvoiceServiceId = null;
      if (isDoubleDatabase && invoiceServices.length > 0) {
        nextInvoiceServiceId = await this._nextSharedId(
          models.db1.InvoiceService,
          models.db2.InvoiceService,
          transaction1,
          transaction2,
        );
      }

      for (const invoiceService of invoiceServices) {
        const serviceData = {
          ...invoiceService,
          id_invoice: invoice1.id,
        };
        if (isDoubleDatabase) {
          serviceData.id = nextInvoiceServiceId;
          nextInvoiceServiceId += 1;
        }

        await models.db1.InvoiceService.create(serviceData, {
          transaction: transaction1,
        });
        if (isDoubleDatabase) {
          await models.db2.InvoiceService.create(serviceData, {
            transaction: transaction2,
          });
        }
      }

      const progressData = {
        id_invoice: invoice1.id,
        id_user: idUserCreate,
        status: "created",
        note: "Invoice created from incoming payment list",
      };
      if (isDoubleDatabase) {
        progressData.id = await this._nextSharedId(
          models.db1.InvoiceVerificationProgress,
          models.db2.InvoiceVerificationProgress,
          transaction1,
          transaction2,
        );
      }

      await models.db1.InvoiceVerificationProgress.create(progressData, {
        transaction: transaction1,
      });
      if (isDoubleDatabase) {
        await models.db2.InvoiceVerificationProgress.create(progressData, {
          transaction: transaction2,
        });
      }

      await incomingInvoiceService.markAsHistory(
        uniqueIds,
        invoice1.id,
        isDoubleDatabase,
        transaction1,
        transaction2,
      );

      await transaction1.commit();
      if (transaction2) await transaction2.commit();

      return await this.getById(invoice1.id, {}, true);
    } catch (error) {
      if (transaction1 && !transaction1.finished) {
        await transaction1.rollback();
      }
      if (transaction2 && !transaction2.finished) {
        await transaction2.rollback();
      }
      throw error;
    }
  }
  /**
   * Update invoice with invoice services (create/update/delete)
   * @param {Number} id - Invoice ID
   * @param {Object} invoiceData - Invoice data to update
   * @param {Array} invoiceServices - Invoice services data
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated invoice with all relations
   */
  async updateWithRelations(
    id,
    invoiceData,
    invoiceServices = [],
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Updating Invoice ID ${id} with services...`);

        // 1. Update Invoice in both databases
        const [updatedRows1] = await this.Model1.update(invoiceData, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(invoiceData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`Invoice with ID ${id} not found`);
        }

        console.log(`✅ Updated Invoice in both databases`);

        // 2. Sync Invoice Services (syncChildRecords handles create/update/delete)
        const servicesData = invoiceServices.map((service) => ({
          ...service,
          id_invoice: id,
        }));

        const servicesResult = await syncChildRecords({
          Model1: models.db1.InvoiceService,
          Model2: models.db2.InvoiceService,
          foreignKey: "id_invoice",
          parentId: id,
          newData: servicesData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        console.log(`✅ Synced Invoice Services`);

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Invoice with all relations successfully updated`);

        return await this.getById(id, {}, isDoubleDatabase);
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const [updatedRows] = await this.Model1.update(invoiceData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`Invoice with ID ${id} not found`);
        }

        const servicesData = invoiceServices.map((service) => ({
          ...service,
          id_invoice: id,
        }));

        const servicesResult = await syncChildRecords({
          Model1: models.db1.InvoiceService,
          Model2: null,
          foreignKey: "id_invoice",
          parentId: id,
          newData: servicesData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        await transaction1.commit();
        console.log(`✅ Invoice updated in DB1 only`);

        return await this.getById(id, {}, isDoubleDatabase);
      }
    } catch (error) {
      console.error(`❌ Error updating Invoice:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to update Invoice: ${error.message}`);
    }
  }

  /**
   * Submit invoice - change status to "on verification" and add progress
   * @param {Number} id - Invoice ID
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated invoice
   */
  async submitInvoice(id, note, id_user, isDoubleDatabase = true) {
    return await this._changeStatusWithProgress(
      id,
      "on verification",
      "submitted",
      note || "Invoice submitted",
      note,
      id_user,
      isDoubleDatabase,
    );
  }

  /**
   * Approve invoice
   * @param {Number} id - Invoice ID
   * @param {Number} id_user - User ID who approves
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated invoice
   */
  async approveInvoice(id, note, id_user, isDoubleDatabase = true) {
    return await this._changeStatusWithProgress(
      id,
      "approved",
      "approved",
      note || "Invoice approved",
      note,
      id_user,
      isDoubleDatabase,
    );
  }

  /**
   * Reject invoice
   * @param {Number} id - Invoice ID
   * @param {Number} id_user - User ID who rejects
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated invoice
   */
  async rejectInvoice(id, note, id_user, isDoubleDatabase = true) {
    return await this._changeStatusWithProgress(
      id,
      "rejected",
      "rejected",
      note || "Invoice rejected",
      note,
      id_user,
      isDoubleDatabase,
    );
  }

  /**
   * waiting for payment invoice
   * @param {Number} id - Invoice ID
   * @param {Number} id_user - User ID who approves
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated invoice
   */
  async waitingPaymentInvoice(
    id,
    note,
    file_invoice,
    id_user,
    isDoubleDatabase = true,
  ) {
    return await this._changeStatusWithProgress(
      id,
      "waiting for payment",
      "waiting for payment",
      note || "Invoice is waiting for payment",
      note,
      id_user,
      isDoubleDatabase,
      file_invoice,
    );
  }

  /**
   * signing for payment invoice
   * @param {Number} id - Invoice ID
   * @param {Number} id_user - User ID who signing
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated invoice
   */
  async signingPaymentInvoice(id, note, id_user, isDoubleDatabase = true) {
    return await this._changeStatusWithProgress(
      id,
      "signing",
      "signing",
      note || "Invoice is signing",
      note,
      id_user,
      isDoubleDatabase,
    );
  }

  /**
   * Pay invoice - change status to "paid off" and add progress
   * @param {Number} id - Invoice ID
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated invoice
   */
  async payInvoice(
    id,
    note,
    payment_date,
    payment_amount,
    payment_method,
    proof_of_payment,
    payment_for,
    id_user,
    isDoubleDatabase = true,
  ) {
    return await this._changeStatusWithProgress(
      id,
      "paid",
      "paid",
      note || "Invoice paid",
      note,
      id_user,
      isDoubleDatabase,
      null,
      payment_date,
      payment_amount,
      payment_method,
      proof_of_payment,
      payment_for,
    );
  }

  /**
   * Internal method to change invoice status and add verification progress
   * @param {Number} id - Invoice ID
   * @param {String} invoiceStatus - New invoice status
   * @param {String} progressStatus - Verification progress status
   * @param {String} progressNote - Note for progress
   * @param {String} invoiceNote - Note to update in invoice (optional)
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated invoice
   */
  async _changeStatusWithProgress(
    id,
    invoiceStatus,
    progressStatus,
    progressNote,
    invoiceNote = null,
    id_user,
    isDoubleDatabase = true,
    file_invoice,
    payment_date,
    payment_amount,
    payment_method,
    proof_of_payment,
    payment_for,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Changing Contract ID ${id} status to "${invoiceStatus}"...`,
        );

        // Prepare update data
        const updateData = { status: invoiceStatus };
        if (invoiceNote) {
          updateData.note = invoiceNote;
        }

        if (invoiceStatus == "approved") {
          updateData.id_user_approve = id_user;
        }

        if (invoiceStatus == "rejected") {
          updateData.id_user_reject = id_user;
        }

        if (invoiceStatus == "signing for payment") {
          updateData.file_invoice = file_invoice;
        }

        if (invoiceStatus == "paid") {
          updateData.payment_date = payment_date;
          updateData.payment_amount = payment_amount;
          updateData.payment_method = payment_method;
          updateData.proof_of_payment = proof_of_payment;
          updateData.payment_for = payment_for;
        }

        // 1. Update Invoice status in both databases
        const [updatedRows1] = await this.Model1.update(updateData, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(updateData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`Contract with ID ${id} not found`);
        }

        console.log(`✅ Updated Contract status in both databases`);

        // 2. Create InvoiceVerificationProgress
        const progressData = {
          id_invoice: id,
          id_user: id_user,
          status: progressStatus,
          note: progressNote,
        };

        const progress1 = await models.db1.InvoiceVerificationProgress.create(
          progressData,
          { transaction: transaction1 },
        );

        const progressDataWithId = {
          ...progressData,
          id: progress1.id,
        };
        await models.db2.InvoiceVerificationProgress.create(
          progressDataWithId,
          {
            transaction: transaction2,
          },
        );

        console.log(
          `✅ Created ContractVerificationProgress with status "${progressStatus}"`,
        );

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(
          `✅ Contract status successfully changed to "${invoiceStatus}"`,
        );

        // Get updated contract
        const updated = await this.getById(id, {}, isDoubleDatabase);

        return updated;
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const updateData = { status: invoiceStatus };
        if (invoiceNote) {
          updateData.note = invoiceNote;
        }

        if (invoiceStatus == "approved") {
          updateData.id_user_approve = id_user;
        }

        if (invoiceStatus == "rejected") {
          updateData.id_user_reject = id_user;
        }

        const [updatedRows] = await this.Model1.update(updateData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`Contract with ID ${id} not found`);
        }

        const progressData = {
          id_invoice: id,
          id_user: id_user,
          status: progressStatus,
          note: progressNote,
        };

        await models.db1.InvoiceVerificationProgress.create(progressData, {
          transaction: transaction1,
        });

        await transaction1.commit();
        console.log(
          `✅ Contract status changed to "${invoiceStatus}" in DB1 only`,
        );

        const updated = await this.getById(id, {}, isDoubleDatabase);

        return updated;
      }
    } catch (error) {
      console.error(`❌ Error changing Contract status:`, error.message);

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(`Failed to change Contract status: ${error.message}`);
    }
  }
}

module.exports = new InvoiceService();
