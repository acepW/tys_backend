const DualDatabaseService = require("../dualDatabase.service");
const companyService = require("../company.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");
const { Op, fn, col, where } = require("sequelize");
const debitNoteService = require("../debitNote/debitNote.service");
const incomingInvoiceService = require("./incomingInvoice.service");
const taxService = require("../masterTax/tax.service");
const {
  fail,
  withTransactions,
  mirrorCreate,
  mirrorUpdate,
  syncFiles,
} = require("../procurement/shared");

const paymentMethods = ["transfer", "cash"];
// Invoice statuses from which sales may upload a payment proof.
const paymentUploadStatuses = ["waiting for payment", "payment proof rejected"];
// Every status after SPV approval: sales may request the tax invoice in any of them.
const taxInvoiceRequestStatuses = [
  "waiting for payment",
  "payment verification",
  "payment proof rejected",
  "revision requested",
  "waiting for revision",
  "paid",
];
// A revision changes only the PPh; PPN stays so the tax invoice remains valid.
const revisableTaxFlags = ["tax_pph_23", "tax_pp_20", "tax_pph_4_ayat_2"];

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
        {
          model: dbModels.File,
          as: "tax_invoice_attachment",
          separate: true,
          where: { is_active: true },
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
            {
              model: dbModels.File,
              as: "revision_attachment",
              required: false,
              where: { is_active: true },
            },
          ],
        },
        {
          model: dbModels.File,
          as: "tax_invoice_attachment",
          required: false,
          where: { is_active: true },
        },
        {
          model: dbModels.InvoicePayment,
          as: "payments",
          separate: true,
          order: [["id", "ASC"]],
          include: [
            {
              model: dbModels.User,
              as: "user_create",
              attributes: ["id", "name", "email"],
            },
            {
              model: dbModels.User,
              as: "user_verify",
              attributes: ["id", "name", "email"],
            },
            {
              model: dbModels.File,
              as: "payment_proof",
              required: false,
              where: { is_active: true },
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
      // The legacy create endpoint accepts invoice totals from the client. When
      // either new deduction is selected, calculate every selected tax on the
      // server so the stored total cannot omit the deduction.
      if (
        invoiceData.tax_pp_20 === true ||
        invoiceData.tax_pph_4_ayat_2 === true
      ) {
        const taxCalculation = await taxService.calculate(
          Number(invoiceData.sub_total || 0),
          invoiceData.tax_ppn,
          invoiceData.tax_pph_23,
          null,
          invoiceData.tax_pp_20,
          invoiceData.tax_pph_4_ayat_2,
        );

        invoiceData = {
          ...invoiceData,
          ppn: taxCalculation.ppn,
          pph: taxCalculation.pph,
          pp_20: taxCalculation.pp_20,
          pph_4_ayat_2: taxCalculation.pph_4_ayat_2,
          total: taxCalculation.total,
        };
      }

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
      const { ppn, pph, pp_20, pph_4_ayat_2, total } =
        await taxService.calculate(
          subTotal,
          invoiceData.tax_ppn,
          invoiceData.tax_pph_23,
          transaction1,
          invoiceData.tax_pp_20,
          invoiceData.tax_pph_4_ayat_2,
        );
      const dataToCreate = {
        date: invoiceData.date,
        due_date: invoiceData.due_date || null,
        invoice_no: invoiceData.invoice_no,
        tax_ppn: invoiceData.tax_ppn === true,
        tax_pph_23: invoiceData.tax_pph_23 === true,
        tax_pp_20: invoiceData.tax_pp_20 === true,
        tax_pph_4_ayat_2: invoiceData.tax_pph_4_ayat_2 === true,
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
        pp_20,
        pph_4_ayat_2,
        total,
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
   * SPV FAT Internal approves and uploads the invoice file; sales can then
   * download it, so the invoice goes straight to waiting for payment.
   * @param {Number} id - Invoice ID
   * @param {String} file_invoice - Invoice file URL (optional)
   * @param {Number} id_user - User ID who approves
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated invoice
   */
  async approveInvoice(
    id,
    note,
    file_invoice,
    id_user,
    isDoubleDatabase = true,
  ) {
    return await this._changeStatusWithProgress(
      id,
      "waiting for payment",
      "approved",
      note || "Invoice approved",
      note,
      id_user,
      isDoubleDatabase,
      file_invoice,
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
   * Sales uploads a payment proof; AR & AP verifies it next. Proofs are accepted
   * one at a time and add up until they cover the invoice total (partial payments).
   * @param {Number} id - Invoice ID
   * @param {Object} data - { amount, transfer_date, bank_name, payment_method, note, payment_proof }
   * @param {Number} idUser - Sales user ID
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated invoice
   */
  async uploadPayment(id, data, idUser, isDoubleDatabase = true) {
    const amount = Number(data.amount);
    if (
      data.amount == null ||
      data.amount === "" ||
      !Number.isInteger(amount) ||
      amount <= 0
    )
      fail("amount must be a positive whole number");
    if (!data.transfer_date) fail("transfer_date is required");
    const paymentMethod = data.payment_method || "transfer";
    if (!paymentMethods.includes(paymentMethod))
      fail("payment_method must be transfer or cash");
    const bankName = data.bank_name?.toString().trim() || null;
    if (paymentMethod === "transfer" && !bankName)
      fail("bank_name is required for transfer payments");
    if (!Array.isArray(data.payment_proof) || !data.payment_proof.length)
      fail("payment_proof must be a non-empty array");

    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const invoice = await this._lockInvoice(id, t1);
      if (!paymentUploadStatuses.includes(invoice.status))
        fail(
          `Payment proof cannot be uploaded while the invoice is ${invoice.status}`,
          409,
        );
      const remaining =
        Number(invoice.total) - (await this._acceptedAmount(invoice.id, t1));
      if (amount > remaining)
        fail(`amount exceeds the remaining invoice balance (${remaining})`);

      const payment = await mirrorCreate(
        "InvoicePayment",
        {
          id_invoice: invoice.id,
          amount,
          transfer_date: data.transfer_date,
          bank_name: bankName,
          payment_method: paymentMethod,
          status: "verification",
          note: data.note || null,
          id_user_create: idUser,
        },
        t1,
        t2,
      );
      await syncFiles(
        "invoice_payments",
        payment.id,
        "payment_proof",
        data.payment_proof,
        idUser,
        t1,
        t2,
      );
      await mirrorUpdate(
        "Invoice",
        invoice.id,
        { status: "payment verification" },
        t1,
        t2,
      );
      await this._addProgress(
        invoice.id,
        idUser,
        "payment uploaded",
        data.note || "Payment proof uploaded",
        t1,
        t2,
      );
    });
    return this.getById(id, {}, true);
  }

  /**
   * AR & AP accepts the payment proof waiting for verification. The invoice is
   * paid once accepted proofs cover its total; otherwise it waits for the rest.
   * invoices.payment_amount keeps the accepted total for the invoice report.
   */
  async acceptPayment(id, note, idUser, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const invoice = await this._lockInvoice(id, t1);
      const payment = await this._paymentInVerification(invoice, t1);
      const accepted =
        (await this._acceptedAmount(invoice.id, t1)) + Number(payment.amount);
      const isPaidOff = accepted >= Number(invoice.total);
      // Any accepted payment makes the proforma final, so AR & AP must issue its
      // tax invoice if sales has not requested one yet.
      const requestsTaxInvoice =
        invoice.tax_ppn && invoice.tax_invoice_status === "none";

      await mirrorUpdate(
        "InvoicePayment",
        payment.id,
        {
          status: "accepted",
          verification_note: note || null,
          id_user_verify: idUser,
          verified_at: new Date(),
        },
        t1,
        t2,
      );
      await mirrorUpdate(
        "Invoice",
        invoice.id,
        {
          status: isPaidOff ? "paid" : "waiting for payment",
          payment_amount: accepted,
          payment_date: payment.transfer_date,
          payment_method: payment.payment_method,
          ...(requestsTaxInvoice && { tax_invoice_status: "requested" }),
        },
        t1,
        t2,
      );
      await this._addProgress(
        invoice.id,
        idUser,
        "payment accepted",
        note ||
          (isPaidOff
            ? "Payment accepted, invoice paid off"
            : "Payment accepted, waiting for the remaining payment"),
        t1,
        t2,
      );
      if (requestsTaxInvoice)
        await this._addProgress(
          invoice.id,
          idUser,
          "tax invoice requested",
          "Tax invoice requested automatically after a payment was accepted",
          t1,
          t2,
        );
    });
    return this.getById(id, {}, true);
  }

  /**
   * AR & AP rejects the payment proof waiting for verification, with a comment
   * telling sales what is wrong (e.g. underpayment). Sales uploads a new proof.
   */
  async rejectPayment(id, note, idUser, isDoubleDatabase = true) {
    if (!note?.toString().trim()) fail("note is required for rejection");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const invoice = await this._lockInvoice(id, t1);
      const payment = await this._paymentInVerification(invoice, t1);
      await mirrorUpdate(
        "InvoicePayment",
        payment.id,
        {
          status: "rejected",
          verification_note: note,
          id_user_verify: idUser,
          verified_at: new Date(),
        },
        t1,
        t2,
      );
      await mirrorUpdate(
        "Invoice",
        invoice.id,
        { status: "payment proof rejected" },
        t1,
        t2,
      );
      await this._addProgress(
        invoice.id,
        idUser,
        "payment rejected",
        note,
        t1,
        t2,
      );
    });
    return this.getById(id, {}, true);
  }

  async _lockInvoice(id, t1) {
    const invoice = await models.db1.Invoice.findOne({
      where: { id, is_active: true },
      transaction: t1,
      lock: t1.LOCK.UPDATE,
    });
    if (!invoice) fail("Invoice not found", 404);
    return invoice;
  }

  async _acceptedAmount(idInvoice, t1) {
    const total = await models.db1.InvoicePayment.sum("amount", {
      where: { id_invoice: idInvoice, status: "accepted" },
      transaction: t1,
    });
    return Number(total || 0);
  }

  async _paymentInVerification(invoice, t1) {
    if (invoice.status !== "payment verification")
      fail(
        `Payment proof cannot be verified while the invoice is ${invoice.status}`,
        409,
      );
    const payment = await models.db1.InvoicePayment.findOne({
      where: { id_invoice: invoice.id, status: "verification" },
      order: [["id", "DESC"]],
      transaction: t1,
    });
    if (!payment) fail("No payment proof is waiting for verification", 409);
    return payment;
  }

  async _addProgress(idInvoice, idUser, status, note, t1, t2) {
    return mirrorCreate(
      "InvoiceVerificationProgress",
      { id_invoice: idInvoice, id_user: idUser, status, note },
      t1,
      t2,
    );
  }

  /**
   * Sales requests the tax invoice (faktur pajak) before payment. Only once, and
   * only for an invoice with PPN; AR & AP then uploads it.
   */
  async requestTaxInvoice(id, note, idUser, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const invoice = await this._lockInvoiceIn(
        id,
        taxInvoiceRequestStatuses,
        "Tax invoice request",
        t1,
      );
      if (!invoice.tax_ppn)
        fail("Tax invoice is not needed for an invoice without PPN");
      if (invoice.tax_invoice_status !== "none")
        fail(`Tax invoice has already been ${invoice.tax_invoice_status}`, 409);
      await mirrorUpdate(
        "Invoice",
        invoice.id,
        { tax_invoice_status: "requested" },
        t1,
        t2,
      );
      await this._addProgress(
        invoice.id,
        idUser,
        "tax invoice requested",
        note || "Tax invoice requested",
        t1,
        t2,
      );
    });
    return this.getById(id, {}, true);
  }

  /**
   * AR & AP uploads the requested tax invoice (faktur pajak): number, date and
   * attachment files. The invoice status itself does not change.
   * @param {Number} id - Invoice ID
   * @param {Object} data - { tax_invoice_no, tax_invoice_date, tax_invoice_attachment, note }
   * @param {Number} idUser - User ID who uploads
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated invoice
   */
  async uploadTaxInvoice(id, data, idUser, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const invoice = await this._lockInvoice(id, t1);
      if (invoice.tax_invoice_status !== "requested")
        fail(
          invoice.tax_invoice_status === "issued"
            ? "Tax invoice has already been issued"
            : "Tax invoice can only be uploaded after it is requested",
          409,
        );
      await mirrorUpdate(
        "Invoice",
        invoice.id,
        {
          tax_invoice_no: data.tax_invoice_no,
          tax_invoice_date: data.tax_invoice_date,
          tax_invoice_status: "issued",
        },
        t1,
        t2,
      );
      await syncFiles(
        "invoices",
        invoice.id,
        "tax_invoice_attachment",
        data.tax_invoice_attachment,
        idUser,
        t1,
        t2,
      );
      await this._addProgress(
        invoice.id,
        idUser,
        "tax invoice issued",
        data.note || `Tax invoice ${data.tax_invoice_no} issued`,
        t1,
        t2,
      );
    });
    return this.getById(id, {}, true);
  }

  /**
   * Sales asks AR & AP to fix the invoice tax (e.g. a PPh the client reported
   * late), with the client's chat as proof. The invoice and tax invoice numbers
   * stay the same, so only an unpaid invoice can be revised.
   */
  async requestRevision(id, data, idUser, isDoubleDatabase = true) {
    if (!data.note?.toString().trim())
      fail("note is required to explain the revision");
    if (
      !Array.isArray(data.revision_attachment) ||
      !data.revision_attachment.length
    )
      fail("revision_attachment must be a non-empty array");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const invoice = await this._lockInvoiceIn(
        id,
        ["waiting for payment"],
        "Revision request",
        t1,
      );
      if (await this._acceptedAmount(invoice.id, t1))
        fail("Invoice cannot be revised after a payment has been accepted", 409);
      await mirrorUpdate(
        "Invoice",
        invoice.id,
        { status: "revision requested" },
        t1,
        t2,
      );
      const progress = await this._addProgress(
        invoice.id,
        idUser,
        "revision requested",
        data.note,
        t1,
        t2,
      );
      await syncFiles(
        "invoice_verification_progress",
        progress.id,
        "revision_attachment",
        data.revision_attachment,
        idUser,
        t1,
        t2,
      );
    });
    return this.getById(id, {}, true);
  }

  /** AR & AP turns down a revision request; sales sees the reason in the note. */
  async rejectRevisionRequest(id, note, idUser, isDoubleDatabase = true) {
    if (!note?.toString().trim()) fail("note is required for rejection");
    return this._move(
      id,
      {
        from: ["revision requested"],
        to: "waiting for payment",
        action: "Rejecting the revision request",
        progress: "revision request rejected",
        note,
      },
      idUser,
      isDoubleDatabase,
    );
  }

  /**
   * AR & AP changes the PPh flags and recalculates the deductions and total, then
   * SPV FAT Internal reviews it. PPN is kept as it is, so the tax invoice (FP)
   * number and amount stay valid.
   * @param {Object} data - { tax_pph_23, tax_pp_20, tax_pph_4_ayat_2, note }; a flag left out keeps its value
   */
  async reviseInvoice(id, data, idUser, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const invoice = await this._lockInvoiceIn(
        id,
        ["revision requested"],
        "Revision",
        t1,
      );
      const flags = {};
      for (const key of revisableTaxFlags) {
        const value = data[key] ?? invoice[key];
        if (typeof value !== "boolean") fail(`${key} must be a boolean`);
        flags[key] = value;
      }
      const { pph, pp_20, pph_4_ayat_2 } = await taxService.calculate(
        invoice.sub_total,
        false,
        flags.tax_pph_23,
        t1,
        flags.tax_pp_20,
        flags.tax_pph_4_ayat_2,
      );
      const total =
        Number(invoice.sub_total) +
        Number(invoice.ppn) -
        pph -
        pp_20 -
        pph_4_ayat_2;
      await mirrorUpdate(
        "Invoice",
        invoice.id,
        {
          ...flags,
          pph,
          pp_20,
          pph_4_ayat_2,
          total,
          status: "waiting for revision",
        },
        t1,
        t2,
      );
      await this._addProgress(
        invoice.id,
        idUser,
        "revised",
        data.note || `Invoice tax revised, total ${total}`,
        t1,
        t2,
      );
    });
    return this.getById(id, {}, true);
  }

  /**
   * SPV FAT Internal approves the revised invoice, optionally with a new invoice
   * file, and it goes back to waiting for payment.
   */
  async approveRevision(id, note, fileInvoice, idUser, isDoubleDatabase = true) {
    return this._move(
      id,
      {
        from: ["waiting for revision"],
        to: "waiting for payment",
        action: "Approving the revision",
        progress: "revision approved",
        note: note || "Invoice revision approved",
        data: fileInvoice !== undefined ? { file_invoice: fileInvoice } : {},
      },
      idUser,
      isDoubleDatabase,
    );
  }

  /** SPV FAT Internal sends the revision back to AR & AP to edit again. */
  async rejectRevision(id, note, idUser, isDoubleDatabase = true) {
    if (!note?.toString().trim()) fail("note is required for rejection");
    return this._move(
      id,
      {
        from: ["waiting for revision"],
        to: "revision requested",
        action: "Rejecting the revision",
        progress: "revision rejected",
        note,
      },
      idUser,
      isDoubleDatabase,
    );
  }

  // Locks the invoice, checks it is in one of `from`, moves it to `to` and logs progress.
  async _move(id, { from, to, action, progress, note, data = {} }, idUser, isDoubleDatabase) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const invoice = await this._lockInvoiceIn(id, from, action, t1);
      await mirrorUpdate("Invoice", invoice.id, { ...data, status: to }, t1, t2);
      await this._addProgress(invoice.id, idUser, progress, note, t1, t2);
    });
    return this.getById(id, {}, true);
  }

  async _lockInvoiceIn(id, statuses, action, t1) {
    const invoice = await this._lockInvoice(id, t1);
    if (!statuses.includes(invoice.status))
      fail(`${action} is not allowed while the invoice is ${invoice.status}`, 409);
    return invoice;
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

        if (progressStatus == "approved") {
          updateData.id_user_approve = id_user;
        }

        if (invoiceStatus == "rejected") {
          updateData.id_user_reject = id_user;
        }

        if (file_invoice !== undefined) {
          updateData.file_invoice = file_invoice;
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

        if (progressStatus == "approved") {
          updateData.id_user_approve = id_user;
        }

        if (invoiceStatus == "rejected") {
          updateData.id_user_reject = id_user;
        }

        if (file_invoice !== undefined) {
          updateData.file_invoice = file_invoice;
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
module.exports.taxInvoiceRequestStatuses = taxInvoiceRequestStatuses;
