const DualDatabaseService = require("../dualDatabase.service");
const companyService = require("../company.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");
const { Op, fn, col, where } = require("sequelize");
const debitNoteService = require("../debitNote/debitNote.service");
const incomingInvoiceService = require("./incomingInvoice.service");
const taxService = require("../masterTax/tax.service");
const { WHT_CHECKLIST } = require("../../models/invoice/invoiceWithholdingTax.model");
const {
  fail,
  withTransactions,
  mirrorCreate,
  mirrorUpdate,
  syncFiles,
} = require("../procurement/shared");

const paymentMethods = ["transfer", "cash"];
// Invoice statuses once it is paid off: they follow its withholding tax receipts.
const whtInvoiceStatuses = [
  "paid waiting wht",
  "wht verification",
  "wht rejected",
  "paid & clear",
];
// Invoice statuses in which sales may upload a withholding tax receipt.
const whtUploadStatuses = ["paid waiting wht", "wht verification", "wht rejected"];
// Invoice PPh column and tax master code per withholding tax type.
const whtSources = {
  pph_23: { flag: "tax_pph_23", amount: "pph", code: "PPH_23", label: "PPh 23" },
  pph_4_ayat_2: {
    flag: "tax_pph_4_ayat_2",
    amount: "pph_4_ayat_2",
    code: "PPH_4_AYAT_2",
    label: "PPh 4(2)",
  },
};
// Tax period (masa pajak) of a withholding tax receipt.
const taxPeriodFormat = /^(0[1-9]|1[0-2])-\d{4}$/;
// Invoice statuses from which sales may upload a payment proof.
const paymentUploadStatuses = ["waiting for payment", "payment proof rejected"];
// Every status after SPV approval: sales may request the tax invoice in any of them.
const taxInvoiceRequestStatuses = [
  "waiting for payment",
  "payment verification",
  "payment proof rejected",
  "revision requested",
  "waiting for revision",
  ...whtInvoiceStatuses,
];
// A revision changes only the PPh; PPN stays so the tax invoice remains valid.
const revisableTaxFlags = ["tax_pph_23", "tax_pp_20", "tax_pph_4_ayat_2"];
// AR & AP edits and submits a draft, and an invoice SPV rejected for its tax.
const editableStatuses = ["pending", "rejected"];
// SPV rejection reasons: tax goes back to AR & AP; ct/po cancelled ends the
// invoice and sales creates a new one from the changed CT/PO.
const rejectTypes = ["tax", "ct/po cancelled"];

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
            {
              model: dbModels.File,
              as: "wht_reject_attachment",
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
          model: dbModels.File,
          as: "file_final_invoice",
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
          model: dbModels.InvoiceWithholdingTax,
          as: "withholding_taxes",
          separate: true,
          order: [["id", "ASC"]],
          include: [
            {
              model: dbModels.User,
              as: "user_upload",
              attributes: ["id", "name", "email"],
            },
            {
              model: dbModels.User,
              as: "user_verify",
              attributes: ["id", "name", "email"],
            },
            {
              model: dbModels.File,
              as: "withholding_tax_receipt",
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
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const invoice = await this._lockInvoiceIn(id, editableStatuses, "Submit", t1);
      const isResubmit = invoice.status === "rejected";
      await mirrorUpdate(
        "Invoice",
        invoice.id,
        { status: "on verification", ...(note && { note }) },
        t1,
        t2,
      );
      await this._addProgress(
        invoice.id,
        id_user,
        "submitted",
        note ||
          (isResubmit
            ? "Invoice resubmitted after tax revision"
            : "Invoice submitted"),
        t1,
        t2,
      );
    });
    return this.getById(id, {}, true);
  }

  /**
   * Approve invoice
   * SPV FAT Internal approves the proforma; nothing is uploaded. Sales can then
   * open it, so the invoice goes straight to waiting for payment.
   * @param {Number} id - Invoice ID
   * @param {String} note - Approval note (optional)
   * @param {Number} id_user - User ID who approves
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated invoice
   */
  async approveInvoice(id, note, id_user, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const invoice = await this._lockInvoiceIn(id, ["on verification"], "Approve", t1);
      await mirrorUpdate(
        "Invoice",
        invoice.id,
        {
          status: "waiting for payment",
          id_user_approve: id_user,
          ...(note && { note }),
        },
        t1,
        t2,
      );
      await this._addProgress(invoice.id, id_user, "approved", note || "Invoice approved", t1, t2);
    });
    return this.getById(id, {}, true);
  }

  /**
   * Reject invoice (SPV FAT Internal)
   * tax: wrong PPh/PPN, the invoice goes back to AR & AP (rejected) to fix and
   * submit again. ct/po cancelled: the CT/PO was changed or cancelled, so the
   * invoice is cancelled for good and sales creates a new one.
   * @param {Number} id - Invoice ID
   * @param {String} note - Rejection note
   * @param {Number} id_user - User ID who rejects
   * @param {Boolean} isDoubleDatabase
   * @param {String} rejectType - "tax" (default) or "ct/po cancelled"
   * @returns {Object} Updated invoice
   */
  async rejectInvoice(id, note, id_user, isDoubleDatabase = true, rejectType = "tax") {
    if (!rejectTypes.includes(rejectType))
      fail(`reject_type must be one of: ${rejectTypes.join(", ")}`);
    const isCancelled = rejectType === "ct/po cancelled";
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const invoice = await this._lockInvoiceIn(id, ["on verification"], "Reject", t1);
      await mirrorUpdate(
        "Invoice",
        invoice.id,
        {
          status: isCancelled ? "cancelled" : "rejected",
          reject_type: rejectType,
          id_user_reject: id_user,
          ...(note && { note }),
        },
        t1,
        t2,
      );
      await this._addProgress(
        invoice.id,
        id_user,
        isCancelled ? "cancelled" : "rejected",
        note ||
          (isCancelled
            ? "Invoice rejected: CT/PO changed or cancelled"
            : "Invoice rejected: tax needs revision"),
        t1,
        t2,
      );
    });
    return this.getById(id, {}, true);
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
      // Any accepted payment makes the proforma final, so AR & AP must issue the
      // final invoice (with its tax invoice when the invoice has PPN) if sales
      // has not requested it yet.
      const requestsTaxInvoice = invoice.tax_invoice_status === "none";
      // Paid off with PPh 23 / PPh 4(2): sales must collect the withholding tax
      // receipts before the invoice is clear.
      const withholdingTaxes = isPaidOff
        ? await this._createWithholdingTaxes(invoice, t1, t2)
        : [];
      const paidStatus = withholdingTaxes.length ? "paid waiting wht" : "paid & clear";

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
          status: isPaidOff ? paidStatus : "waiting for payment",
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
          (!isPaidOff
            ? "Payment accepted, waiting for the remaining payment"
            : withholdingTaxes.length
              ? `Payment accepted, invoice paid off; waiting for the withholding tax receipt (${withholdingTaxes
                  .map((tax) => whtSources[tax.tax_type].label)
                  .join(", ")})`
              : "Payment accepted, invoice paid off"),
        t1,
        t2,
      );
      if (isPaidOff && !withholdingTaxes.length)
        await this._addProgress(
          invoice.id,
          idUser,
          "paid & clear",
          "Invoice paid off without withholding tax",
          t1,
          t2,
        );
      if (requestsTaxInvoice)
        await this._addProgress(
          invoice.id,
          idUser,
          invoice.tax_ppn ? "tax invoice requested" : "final invoice requested",
          invoice.tax_ppn
            ? "Final invoice and tax invoice requested automatically after a payment was accepted"
            : "Final invoice requested automatically after a payment was accepted",
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
   * AR & AP issues the final invoice (file_final_invoice files) and, for an
   * invoice with PPN, the requested tax invoice (faktur pajak): number, date and
   * attachment files. The proforma becomes final; the invoice number and status
   * stay the same.
   * @param {Number} id - Invoice ID
   * @param {Object} data - { file_final_invoice, tax_invoice_no, tax_invoice_date, tax_invoice_attachment, note }
   * @param {Number} idUser - User ID who uploads
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated invoice
   */
  async uploadTaxInvoice(id, data, idUser, isDoubleDatabase = true) {
    if (!Array.isArray(data.file_final_invoice) || !data.file_final_invoice.length)
      fail("file_final_invoice must be a non-empty array");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const invoice = await this._lockInvoice(id, t1);
      if (invoice.tax_invoice_status !== "requested")
        fail(
          invoice.tax_invoice_status === "issued"
            ? "Final invoice and tax invoice have already been issued"
            : "Final invoice and tax invoice can only be uploaded after they are requested",
          409,
        );
      if (invoice.tax_ppn) {
        if (!data.tax_invoice_no?.toString().trim())
          fail("tax_invoice_no is required");
        if (!data.tax_invoice_date) fail("tax_invoice_date is required");
      }
      await mirrorUpdate(
        "Invoice",
        invoice.id,
        {
          ...(invoice.tax_ppn && {
            tax_invoice_no: data.tax_invoice_no.toString().trim(),
            tax_invoice_date: data.tax_invoice_date,
          }),
          tax_invoice_status: "issued",
          is_final: true,
          final_at: new Date(),
        },
        t1,
        t2,
      );
      await syncFiles(
        "invoices",
        invoice.id,
        "file_final_invoice",
        data.file_final_invoice,
        idUser,
        t1,
        t2,
      );
      if (invoice.tax_ppn)
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
        invoice.tax_ppn ? "tax invoice issued" : "final invoice issued",
        data.note ||
          (invoice.tax_ppn
            ? `Final invoice and tax invoice ${data.tax_invoice_no.toString().trim()} issued`
            : "Final invoice issued"),
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
   * SPV FAT Internal approves the revised invoice (no file is uploaded), and it
   * goes back to waiting for payment.
   */
  async approveRevision(id, note, idUser, isDoubleDatabase = true) {
    return this._move(
      id,
      {
        from: ["waiting for revision"],
        to: "waiting for payment",
        action: "Approving the revision",
        progress: "revision approved",
        note: note || "Invoice revision approved",
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
  /**
   * Sales uploads the withholding tax receipt (bukti potong) of one PPh type,
   * new or after a rejection; AR & AP verifies it next.
   * @param {Object} data - { withholding_tax_receipt (files), note }
   */
  async uploadWithholdingTax(id, whtId, data, idUser, isDoubleDatabase = true) {
    if (
      !Array.isArray(data.withholding_tax_receipt) ||
      !data.withholding_tax_receipt.length
    )
      fail("withholding_tax_receipt must be a non-empty array");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const { invoice, taxes, tax } = await this._lockWithholdingTax(
        id,
        whtId,
        whtUploadStatuses,
        ["waiting", "rejected"],
        "uploaded",
        t1,
      );
      await mirrorUpdate(
        "InvoiceWithholdingTax",
        tax.id,
        {
          status: "verification",
          note: data.note || null,
          id_user_upload: idUser,
          uploaded_at: new Date(),
        },
        t1,
        t2,
      );
      await syncFiles(
        "invoice_withholding_taxes",
        tax.id,
        "withholding_tax_receipt",
        data.withholding_tax_receipt,
        idUser,
        t1,
        t2,
      );
      await this._settleWithholdingTaxes(invoice, taxes, tax, "verification", t1, t2);
      await this._addProgress(
        invoice.id,
        idUser,
        "wht uploaded",
        data.note || `${whtSources[tax.tax_type].label} withholding tax receipt uploaded`,
        t1,
        t2,
      );
    });
    return this.getById(id, {}, true);
  }

  /**
   * AR & AP accepts a withholding tax receipt once every checklist item passes,
   * filling its number, tax period (MM-YYYY) and date. The invoice is paid &
   * clear when every receipt is.
   * @param {Object} data - { checklist, receipt_no, tax_period, receipt_date, note }
   */
  async acceptWithholdingTax(id, whtId, data, idUser, isDoubleDatabase = true) {
    const checklist = data.checklist;
    if (!checklist || typeof checklist !== "object" || Array.isArray(checklist))
      fail("checklist must be an object");
    const unchecked = WHT_CHECKLIST.filter((item) => checklist[item] !== true);
    if (unchecked.length)
      fail(
        `Every checklist item must be checked to accept; reject the receipt instead (unchecked: ${unchecked.join(", ")})`,
      );
    if (!data.receipt_no?.toString().trim()) fail("receipt_no is required");
    if (!taxPeriodFormat.test(data.tax_period ?? ""))
      fail("tax_period must use MM-YYYY format");
    if (!data.receipt_date || Number.isNaN(Date.parse(data.receipt_date)))
      fail("receipt_date must be a valid date");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const { invoice, taxes, tax } = await this._lockWithholdingTax(
        id,
        whtId,
        ["wht verification"],
        ["verification"],
        "accepted",
        t1,
      );
      await mirrorUpdate(
        "InvoiceWithholdingTax",
        tax.id,
        {
          status: "clear",
          receipt_no: data.receipt_no.toString().trim(),
          tax_period: data.tax_period,
          receipt_date: data.receipt_date,
          checklist: Object.fromEntries(WHT_CHECKLIST.map((item) => [item, true])),
          id_user_verify: idUser,
          verified_at: new Date(),
        },
        t1,
        t2,
      );
      const status = await this._settleWithholdingTaxes(invoice, taxes, tax, "clear", t1, t2);
      await this._addProgress(
        invoice.id,
        idUser,
        "wht accepted",
        data.note ||
          `${whtSources[tax.tax_type].label} withholding tax receipt ${data.receipt_no.toString().trim()} accepted`,
        t1,
        t2,
      );
      if (status === "paid & clear")
        await this._addProgress(
          invoice.id,
          idUser,
          "paid & clear",
          "Every withholding tax receipt is clear",
          t1,
          t2,
        );
    });
    return this.getById(id, {}, true);
  }

  /**
   * AR & AP rejects a withholding tax receipt with a comment and at least one
   * screenshot of the problem; sales asks the client for a corrected one.
   * @param {Object} data - { note, wht_reject_attachment (files), checklist }
   */
  async rejectWithholdingTax(id, whtId, data, idUser, isDoubleDatabase = true) {
    if (!data.note?.toString().trim()) fail("note is required for rejection");
    if (
      !Array.isArray(data.wht_reject_attachment) ||
      !data.wht_reject_attachment.length
    )
      fail("wht_reject_attachment must be a non-empty array");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const { invoice, taxes, tax } = await this._lockWithholdingTax(
        id,
        whtId,
        ["wht verification"],
        ["verification"],
        "rejected",
        t1,
      );
      await mirrorUpdate(
        "InvoiceWithholdingTax",
        tax.id,
        {
          status: "rejected",
          note_reject: data.note,
          // The checklist AR & AP filled in, if any, shows which items failed.
          ...(data.checklist &&
            typeof data.checklist === "object" && {
              checklist: Object.fromEntries(
                WHT_CHECKLIST.map((item) => [item, data.checklist[item] === true]),
              ),
            }),
          id_user_verify: idUser,
          verified_at: new Date(),
        },
        t1,
        t2,
      );
      await this._settleWithholdingTaxes(invoice, taxes, tax, "rejected", t1, t2);
      const progress = await this._addProgress(
        invoice.id,
        idUser,
        "wht rejected",
        `${whtSources[tax.tax_type].label}: ${data.note}`,
        t1,
        t2,
      );
      await syncFiles(
        "invoice_verification_progress",
        progress.id,
        "wht_reject_attachment",
        data.wht_reject_attachment,
        idUser,
        t1,
        t2,
      );
    });
    return this.getById(id, {}, true);
  }

  // One withholding tax row per PPh type the paid-off invoice withholds. DPP and
  // amount come from the invoice, the rate from the active tax master.
  async _createWithholdingTaxes(invoice, t1, t2) {
    const types = Object.entries(whtSources)
      .filter(([, source]) => invoice[source.flag] && Number(invoice[source.amount]) > 0)
      .map(([type]) => type);
    if (!types.length) return [];
    const rates = await taxService.getActiveRates(
      types.map((type) => whtSources[type].code),
      t1,
    );
    const created = [];
    for (const type of types)
      created.push(
        await mirrorCreate(
          "InvoiceWithholdingTax",
          {
            id_invoice: invoice.id,
            tax_type: type,
            dpp: invoice.sub_total,
            rate: rates[whtSources[type].code],
            amount: invoice[whtSources[type].amount],
            status: "waiting",
          },
          t1,
          t2,
        ),
      );
    return created;
  }

  // Locks the invoice and its withholding taxes; whtId must be one of them and in
  // one of taxStatuses.
  async _lockWithholdingTax(id, whtId, invoiceStatuses, taxStatuses, action, t1) {
    const invoice = await this._lockInvoiceIn(
      id,
      invoiceStatuses,
      `Withholding tax receipt ${action}`,
      t1,
    );
    const taxes = await models.db1.InvoiceWithholdingTax.findAll({
      where: { id_invoice: invoice.id },
      transaction: t1,
      lock: t1.LOCK.UPDATE,
    });
    const tax = taxes.find((row) => row.id === Number(whtId));
    if (!tax) fail("Withholding tax not found", 404);
    if (!taxStatuses.includes(tax.status))
      fail(`Withholding tax receipt cannot be ${action} while it is ${tax.status}`, 409);
    return { invoice, taxes, tax };
  }

  // Sets the invoice status from every receipt, with `tax` now at `taxStatus`:
  // any in verification, then any rejected, then all clear, else waiting.
  async _settleWithholdingTaxes(invoice, taxes, tax, taxStatus, t1, t2) {
    const statuses = taxes.map((row) => (row.id === tax.id ? taxStatus : row.status));
    const status = statuses.includes("verification")
      ? "wht verification"
      : statuses.includes("rejected")
        ? "wht rejected"
        : statuses.every((value) => value === "clear")
          ? "paid & clear"
          : "paid waiting wht";
    await mirrorUpdate("Invoice", invoice.id, { status }, t1, t2);
    return status;
  }

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
}

module.exports = new InvoiceService();
module.exports.taxInvoiceRequestStatuses = taxInvoiceRequestStatuses;
module.exports.editableStatuses = editableStatuses;
module.exports.rejectTypes = rejectTypes;
module.exports.whtUploadStatuses = whtUploadStatuses;
