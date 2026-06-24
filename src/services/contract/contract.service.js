const DualDatabaseService = require("../dualDatabase.service");
const companyService = require("../company.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");
const { Op, fn, col } = require("sequelize");

class ContractService extends DualDatabaseService {
  constructor() {
    super("Contract");
  }

  /**
   * Get all contracts with relations
   * @param {Object} options - Query options
   * @param {Number} page - Page number for pagination
   * @param {Number} limit - Number of records per page
   * @param {Boolean} isDoubleDatabase
   * @param {Boolean} includeHistory - if true, returns all versions; if false, only latest/active version per chain
   * @returns {Array} Contracts with relations
   */
  async getAllWithRelations(
    options = {},
    page = null,
    limit = null,
    isDoubleDatabase = true,
    includeHistory = false
  ) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const baseWhere = options.where || {};

    // 🔥 Default: hanya tampilkan versi yang masih aktif per rangkaian
    const whereClause = includeHistory
      ? baseWhere
      : { ...baseWhere, is_active: true };

    const queryOptions = {
      ...options,
      where: whereClause,
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
          model: dbModels.Company,
          as: "company",
        },
        {
          model: dbModels.Customer,
          as: "customer",
        },
        // 🔥 Info ringkas versi sebelumnya
        {
          model: dbModels.Contract,
          as: "previous_contract",
          attributes: ["id", "contract_no", "version", "is_active"],
        },
        // 🔥 Info ringkas versi penggantinya (kalau ada)
        {
          model: dbModels.Contract,
          as: "next_contract",
          attributes: ["id", "contract_no", "version", "is_active"],
        },
        {
          model: dbModels.PreOrder,
          as: "pre_orders",
        },
        {
          model: dbModels.ContractService,
          as: "services",
          separate: true,
          include: [
            {
              model: dbModels.QuotationService,
              as: "quotation_service",
            },
            {
              model: dbModels.ContractProjectPlan,
              as: "contract_project_plans",
              separate: true,
              order: [["plan_start_date", "ASC"]],
              include: [
                {
                  model: dbModels.ContractProjectPlanPoint,
                  as: "contract_project_plan_points",
                  include: [
                    {
                      model: dbModels.User,
                      as: "user",
                      attributes: ["id", "name", "email"],
                    },
                  ],
                },
                {
                  model: dbModels.ContractProjectPlanCost,
                  as: "contract_project_plan_costs",
                  include: [
                    {
                      model: dbModels.User,
                      as: "user",
                      attributes: ["id", "name", "email"],
                    },
                  ],
                },
                {
                  model: dbModels.PaymentRequest,
                  as: "payment_requests",
                },
                {
                  model: dbModels.User,
                  as: "user_started",
                  attributes: ["id", "name", "email"],
                },
                {
                  model: dbModels.User,
                  as: "user_stopped",
                  attributes: ["id", "name", "email"],
                },
              ],
            },
          ],
        },
        {
          model: dbModels.ContractClause,
          as: "clauses",
          separate: true,
          include: [
            {
              model: dbModels.ContractClausePoint,
              as: "clause_point",
              separate: true,
              include: [
                {
                  model: dbModels.ContractClauseLog,
                  as: "clause_logs",
                  attributes: [
                    "id",
                    "id_contract_clause_point",
                    "description_indo_before",
                    "description_mandarin_before",
                    "description_indo_after",
                    "description_mandarin_after",
                  ],
                  separate: true,
                },
              ],
            },
            {
              model: dbModels.ContractClauseLog,
              as: "clause_logs",
              attributes: [
                "id",
                "id_contract_clause",
                "description_indo_before",
                "description_mandarin_before",
                "description_indo_after",
                "description_mandarin_after",
              ],
              separate: true,
            },
          ],
        },
        {
          model: dbModels.ContractVerificationProgress,
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
          model: dbModels.ContractPayment,
          as: "contract_payment",
          include: [
            {
              model: dbModels.ContractPaymentList,
              as: "contract_payment_list",
              include: [
                {
                  model: dbModels.ContractPaymentService,
                  as: "contract_payment_services",
                  include: [
                    {
                      model: dbModels.QuotationService,
                      as: "quotation_service",
                    },
                  ],
                },
              ],
            },
            {
              model: dbModels.Invoice,
              as: "invoices",
              attributes: ["id", "invoice_no"],
            },
          ],
        },
      ],
      order: includeHistory
        ? [
            ["id_root_contract", "ASC"],
            ["version", "DESC"],
          ]
        : [["createdAt", "DESC"]],
    };

    if (!page || !limit) {
      return await this.findAll(queryOptions, isDoubleDatabase);
    }

    const offset = (page - 1) * limit;
    const { count, rows } = await this.findAndCountAll(
      { ...queryOptions, limit, offset },
      isDoubleDatabase
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
   * Get contract by ID with relations (includes chain info)
   */
  async getById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.Quotation,
          as: "quotation",
          include: [
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
              ],
            },
          ],
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
          model: dbModels.PreOrder,
          as: "pre_orders",
        },
        // 🔥 Chain info: versi sebelumnya & berikutnya
        {
          model: dbModels.Contract,
          as: "previous_contract",
          attributes: [
            "id",
            "contract_no",
            "version",
            "is_active",
            "createdAt",
          ],
        },
        {
          model: dbModels.Contract,
          as: "next_contract",
          attributes: [
            "id",
            "contract_no",
            "version",
            "is_active",
            "createdAt",
          ],
        },
        {
          model: dbModels.ContractService,
          as: "services",
          include: [
            {
              model: dbModels.QuotationService,
              as: "quotation_service",
              include: [
                {
                  model: dbModels.InvoiceService,
                  as: "invoice_services",
                  include: [
                    {
                      model: dbModels.Invoice,
                      as: "invoice",
                    },
                  ],
                },
              ],
            },
            {
              model: dbModels.ContractProjectPlan,
              as: "contract_project_plans",
              separate: true,
              order: [["plan_start_date", "ASC"]],
              include: [
                {
                  model: dbModels.ContractProjectPlanPoint,
                  as: "contract_project_plan_points",
                  include: [
                    {
                      model: dbModels.User,
                      as: "user",
                      attributes: ["id", "name", "email"],
                    },
                  ],
                },
                {
                  model: dbModels.ContractProjectPlanCost,
                  as: "contract_project_plan_costs",
                  include: [
                    {
                      model: dbModels.User,
                      as: "user",
                      attributes: ["id", "name", "email"],
                    },
                  ],
                },
                {
                  model: dbModels.PaymentRequest,
                  as: "payment_requests",
                },
                {
                  model: dbModels.User,
                  as: "user_started",
                  attributes: ["id", "name", "email"],
                },
                {
                  model: dbModels.User,
                  as: "user_stopped",
                  attributes: ["id", "name", "email"],
                },
              ],
            },
          ],
        },
        {
          model: dbModels.ContractClause,
          as: "clauses",
          include: [
            {
              model: dbModels.ContractClausePoint,
              as: "clause_point",
              separate: true,
              include: [
                {
                  model: dbModels.ContractClauseLog,
                  as: "clause_logs",
                  attributes: [
                    "id",
                    "id_contract_clause_point",
                    "description_indo_before",
                    "description_mandarin_before",
                    "description_indo_after",
                    "description_mandarin_after",
                  ],
                  separate: true,
                },
              ],
            },
            {
              model: dbModels.ContractClauseLog,
              as: "clause_logs",
              attributes: [
                "id",
                "id_contract_clause",
                "description_indo_before",
                "description_mandarin_before",
                "description_indo_after",
                "description_mandarin_after",
              ],
              separate: true,
            },
          ],
        },
        {
          model: dbModels.ContractVerificationProgress,
          as: "verification_progress",
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
          model: dbModels.ContractPayment,
          as: "contract_payment",
          include: [
            {
              model: dbModels.ContractPaymentList,
              as: "contract_payment_list",
              include: [
                {
                  model: dbModels.ContractPaymentService,
                  as: "contract_payment_services",
                },
              ],
            },
            {
              model: dbModels.Invoice,
              as: "invoices",
              attributes: ["id", "invoice_no"],
            },
          ],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Get full version history of a contract chain (all versions, oldest to newest)
   * Can be called with the ID of ANY version in the chain - always returns the full chain
   * @param {Number} id - Contract ID (any version in the chain)
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} All contract versions in the chain, ordered by version ASC
   */
  async getHistory(id, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const contract = await dbModels.Contract.findByPk(id, {
      attributes: ["id", "id_root_contract"],
    });

    if (!contract) {
      throw new Error(`Contract with ID ${id} not found`);
    }

    const rootId = contract.id_root_contract || contract.id;

    const history = await dbModels.Contract.findAll({
      where: {
        [Op.or]: [{ id: rootId }, { id_root_contract: rootId }],
      },
      include: [
        {
          model: dbModels.Customer,
          as: "customer",
          attributes: ["id", "customer_name"],
        },
        {
          model: dbModels.Company,
          as: "company",
          attributes: ["id", "company_name"],
        },
      ],
      order: [["version", "ASC"]],
    });

    return history;
  }

  /**
   * Get no Contract
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Contract with relations
   */
  async getNoContract(isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // 🔥 1. Ambil total per company
    const dataTotal = await dbModels.Contract.findAll({
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
      isDoubleDatabase
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

      const noQuotation = `${nomorUrut}/KPJ/${initial}/${bulanRomawi}/${year}`;

      return {
        id_company: company.id,
        company_name: company.company_name,
        initial_company: initial,
        total,
        next_number: nomorUrut,
        no_contract: noQuotation,
      };
    });

    return result;
  }

  /**
   * Create contract with services, clauses, clause points, and clause logs
   * Supports replacement chaining: if replaceContractId is provided,
   * this new contract becomes the next version in that contract's chain,
   * and the old contract is deactivated atomically.
   *
   * @param {Object} contractData - Contract data
   * @param {Array} services - Contract services data
   * @param {Array} clauses - Contract clauses data
   * @param {Array} payment_request_contract
   * @param {Number} id_user_create
   * @param {Boolean} isDoubleDatabase
   * @param {Number|null} replaceContractId - ID of contract being replaced (optional)
   * @returns {Object} Created contract with all relations
   */
  async createWithRelations(
    contractData,
    services = [],
    clauses = [],
    payment_request_contract = [],
    id_user_create,
    isDoubleDatabase = true,
    replaceContractId = null
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Creating Contract with all relations in both databases...`
        );

        // 🔥 0. Resolve chain info if this is a replacement
        let chainData = {};
        let oldContract1 = null;

        if (replaceContractId) {
          oldContract1 = await models.db1.Contract.findByPk(replaceContractId, {
            transaction: transaction1,
          });

          if (!oldContract1) {
            throw new Error(
              `Contract to replace with ID ${replaceContractId} not found`
            );
          }

          const rootId = oldContract1.id_root_contract || oldContract1.id;

          chainData = {
            id_previous_contract: oldContract1.id,
            id_root_contract: rootId,
            version: (oldContract1.version || 1) + 1,
            is_adendum: true,
          };

          console.log(
            `🔗 Replacement detected: old Contract ID ${oldContract1.id} -> new version ${chainData.version} (root: ${rootId})`
          );
        }

        const finalContractData = { ...contractData, ...chainData };

        // 1. Create Contract in DB1
        const contract1 = await this.Model1.create(finalContractData, {
          transaction: transaction1,
        });
        console.log(`✅ Created Contract in DB1 with ID: ${contract1.id}`);

        // 2. Create Contract in DB2 with same ID
        const contractDataWithId = { ...finalContractData, id: contract1.id };
        await this.Model2.create(contractDataWithId, {
          transaction: transaction2,
        });
        console.log(`✅ Created Contract in DB2 with ID: ${contract1.id}`);

        // 🔥 2b. Deactivate old contract (both DBs) if this is a replacement
        if (replaceContractId) {
          await models.db1.Contract.update(
            { is_active: false },
            { where: { id: replaceContractId }, transaction: transaction1 }
          );
          await models.db2.Contract.update(
            { is_active: false },
            { where: { id: replaceContractId }, transaction: transaction2 }
          );
          console.log(
            `✅ Deactivated old Contract ID: ${replaceContractId} in both databases`
          );
        }

        // 3. Sync Contract Services
        const servicesData = services.map((service) => ({
          ...service,
          id_contract: contract1.id,
        }));

        const servicesResult = await syncChildRecords({
          Model1: models.db1.ContractService,
          Model2: models.db2.ContractService,
          foreignKey: "id_contract",
          parentId: contract1.id,
          newData: servicesData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });
        console.log(
          `✅ Synced ${servicesResult.created?.length || 0} Contract Services`
        );

        // 4. Update QuotationService is_selected_contract = true
        for (const service of services) {
          if (service.id_quotation_service) {
            await models.db1.QuotationService.update(
              { is_selected_contract: true },
              {
                where: { id: service.id_quotation_service },
                transaction: transaction1,
              }
            );
            await models.db2.QuotationService.update(
              { is_selected_contract: true },
              {
                where: { id: service.id_quotation_service },
                transaction: transaction2,
              }
            );
          }
        }
        console.log(`✅ Updated QuotationService is_selected_contract to true`);

        // 5. Process Contract Clauses
        const clausesResult = [];
        for (const clauseData of clauses) {
          const { clause_point = [], clause_logs = [], ...clause } = clauseData;

          const clauseDataToCreate = { ...clause, id_contract: contract1.id };
          const clause1 = await models.db1.ContractClause.create(
            clauseDataToCreate,
            {
              transaction: transaction1,
            }
          );
          await models.db2.ContractClause.create(
            { ...clauseDataToCreate, id: clause1.id },
            { transaction: transaction2 }
          );
          console.log(`✅ Created Contract Clause with ID: ${clause1.id}`);

          const clausePointsResult = [];
          for (const pointData of clause_point) {
            const { clause_logs: pointLogs = [], ...point } = pointData;

            const pointDataToCreate = {
              ...point,
              id_contract_clause: clause1.id,
            };
            const point1 = await models.db1.ContractClausePoint.create(
              pointDataToCreate,
              {
                transaction: transaction1,
              }
            );
            await models.db2.ContractClausePoint.create(
              { ...pointDataToCreate, id: point1.id },
              { transaction: transaction2 }
            );
            console.log(`✅ Created Clause Point with ID: ${point1.id}`);

            const pointLogsData = pointLogs.map((log) => ({
              ...log,
              id_contract_clause_point: point1.id,
            }));
            const pointLogsResult = await syncChildRecords({
              Model1: models.db1.ContractClauseLog,
              Model2: models.db2.ContractClauseLog,
              foreignKey: "id_contract_clause_point",
              parentId: point1.id,
              newData: pointLogsData,
              transaction1,
              transaction2,
              isDoubleDatabase,
            });
            console.log(
              `✅ Synced ${
                pointLogsResult.created?.length || 0
              } Clause Logs for Point ${point1.id}`
            );

            clausePointsResult.push({
              clause_point: point1.toJSON(),
              clause_logs: pointLogsResult,
            });
          }

          const clauseLogsData = clause_logs.map((log) => ({
            ...log,
            id_contract_clause: clause1.id,
          }));
          const clauseLogsResult = await syncChildRecords({
            Model1: models.db1.ContractClauseLog,
            Model2: models.db2.ContractClauseLog,
            foreignKey: "id_contract_clause",
            parentId: clause1.id,
            newData: clauseLogsData,
            transaction1,
            transaction2,
            isDoubleDatabase,
          });
          console.log(
            `✅ Synced ${
              clauseLogsResult.created?.length || 0
            } Clause-level Logs for Clause ${clause1.id}`
          );

          clausesResult.push({
            clause: clause1.toJSON(),
            clause_points: clausePointsResult,
            clause_logs: clauseLogsResult,
          });
        }

        // 6. Process Contract Payments
        const paymentsResult = [];
        for (const paymentData of payment_request_contract) {
          const { contract_payment_list = [], ...payment } = paymentData;

          const paymentDataToCreate = { ...payment, id_contract: contract1.id };
          const payment1 = await models.db1.ContractPayment.create(
            paymentDataToCreate,
            {
              transaction: transaction1,
            }
          );
          await models.db2.ContractPayment.create(
            { ...paymentDataToCreate, id: payment1.id },
            { transaction: transaction2 }
          );
          console.log(`✅ Created ContractPayment with ID: ${payment1.id}`);

          const paymentListsResult = [];
          for (const listData of contract_payment_list) {
            const { id_quotation_service, ...paymentList } = listData;

            const listDataToCreate = {
              ...paymentList,
              id_contract_payment: payment1.id,
            };
            const list1 = await models.db1.ContractPaymentList.create(
              listDataToCreate,
              {
                transaction: transaction1,
              }
            );
            await models.db2.ContractPaymentList.create(
              { ...listDataToCreate, id: list1.id },
              { transaction: transaction2 }
            );
            console.log(`✅ Created ContractPaymentList with ID: ${list1.id}`);

            const paymentServiceData = {
              id_contract_payment: payment1.id,
              id_contract_payment_list: list1.id,
              id_quotation_service,
            };
            const service1 = await models.db1.ContractPaymentService.create(
              paymentServiceData,
              {
                transaction: transaction1,
              }
            );
            await models.db2.ContractPaymentService.create(
              { ...paymentServiceData, id: service1.id },
              { transaction: transaction2 }
            );
            console.log(
              `✅ Created ContractPaymentService with ID: ${service1.id}`
            );

            paymentListsResult.push({
              payment_list: list1.toJSON(),
              payment_service: service1.toJSON(),
            });
          }

          paymentsResult.push({
            payment: payment1.toJSON(),
            payment_lists: paymentListsResult,
          });
        }

        // 7. Create initial ContractVerificationProgress
        const progressData = {
          id_contract: contract1.id,
          id_user: id_user_create,
          status: "created",
          note: replaceContractId
            ? `Contract created as replacement for Contract ID ${replaceContractId}`
            : "Contract created",
        };
        const progress1 = await models.db1.ContractVerificationProgress.create(
          progressData,
          {
            transaction: transaction1,
          }
        );
        await models.db2.ContractVerificationProgress.create(
          { ...progressData, id: progress1.id },
          { transaction: transaction2 }
        );
        console.log(
          `✅ Created ContractVerificationProgress with status "created"`
        );

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Contract with all relations successfully created`);

        return {
          contract: contract1.toJSON(),
          services: servicesResult,
          clauses: clausesResult,
          payments: paymentsResult,
          verification_progress: progress1.toJSON(),
          replaced_contract_id: replaceContractId || null,
        };
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        let chainData = {};
        if (replaceContractId) {
          const oldContract = await models.db1.Contract.findByPk(
            replaceContractId,
            { transaction: transaction1 }
          );

          if (!oldContract) {
            throw new Error(
              `Contract to replace with ID ${replaceContractId} not found`
            );
          }

          const rootId = oldContract.id_root_contract || oldContract.id;

          chainData = {
            id_previous_contract: oldContract.id,
            id_root_contract: rootId,
            version: (oldContract.version || 1) + 1,
            is_adendum: true,
          };

          console.log(
            `🔗 Replacement detected: old Contract ID ${oldContract.id} -> new version ${chainData.version} (root: ${rootId})`
          );
        }

        const finalContractData = { ...contractData, ...chainData };

        const contract = await this.Model1.create(finalContractData, {
          transaction: transaction1,
        });

        if (replaceContractId) {
          await models.db1.Contract.update(
            { is_active: false },
            { where: { id: replaceContractId }, transaction: transaction1 }
          );
          console.log(
            `✅ Deactivated old Contract ID: ${replaceContractId} in DB1 only`
          );
        }

        const servicesData = services.map((service) => ({
          ...service,
          id_contract: contract.id,
        }));
        const servicesResult = await syncChildRecords({
          Model1: models.db1.ContractService,
          Model2: null,
          foreignKey: "id_contract",
          parentId: contract.id,
          newData: servicesData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        for (const service of services) {
          if (service.id_quotation_service) {
            await models.db1.QuotationService.update(
              { is_selected_contract: true },
              {
                where: { id: service.id_quotation_service },
                transaction: transaction1,
              }
            );
          }
        }

        const clausesResult = [];
        for (const clauseData of clauses) {
          const { clause_point = [], clause_logs = [], ...clause } = clauseData;

          const clauseDataToCreate = { ...clause, id_contract: contract.id };
          const createdClause = await models.db1.ContractClause.create(
            clauseDataToCreate,
            {
              transaction: transaction1,
            }
          );

          const clausePointsResult = [];
          for (const pointData of clause_point) {
            const { clause_logs: pointLogs = [], ...point } = pointData;

            const pointDataToCreate = {
              ...point,
              id_contract_clause: createdClause.id,
            };
            const createdPoint = await models.db1.ContractClausePoint.create(
              pointDataToCreate,
              {
                transaction: transaction1,
              }
            );

            const pointLogsData = pointLogs.map((log) => ({
              ...log,
              id_contract_clause: createdClause.id,
              id_contract_clause_point: createdPoint.id,
            }));
            const pointLogsResult = await syncChildRecords({
              Model1: models.db1.ContractClauseLog,
              Model2: null,
              foreignKey: "id_contract_clause_point",
              parentId: createdPoint.id,
              newData: pointLogsData,
              transaction1,
              transaction2: null,
              isDoubleDatabase: false,
            });

            clausePointsResult.push({
              clause_point: createdPoint.toJSON(),
              clause_logs: pointLogsResult,
            });
          }

          const clauseLogsData = clause_logs.map((log) => ({
            ...log,
            id_contract_clause: createdClause.id,
            id_contract_clause_point: null,
          }));
          const clauseLogsResult = await syncChildRecords({
            Model1: models.db1.ContractClauseLog,
            Model2: null,
            foreignKey: "id_contract_clause",
            parentId: createdClause.id,
            newData: clauseLogsData,
            transaction1,
            transaction2: null,
            isDoubleDatabase: false,
          });

          clausesResult.push({
            clause: createdClause.toJSON(),
            clause_points: clausePointsResult,
            clause_logs: clauseLogsResult,
          });
        }

        const paymentsResult = [];
        for (const paymentData of payment_request_contract) {
          const { contract_payment_list = [], ...payment } = paymentData;

          const paymentDataToCreate = { ...payment, id_contract: contract.id };
          const createdPayment = await models.db1.ContractPayment.create(
            paymentDataToCreate,
            {
              transaction: transaction1,
            }
          );
          console.log(
            `✅ Created ContractPayment with ID: ${createdPayment.id}`
          );

          const paymentListsResult = [];
          for (const listData of contract_payment_list) {
            const { id_quotation_service, ...paymentList } = listData;

            const listDataToCreate = {
              ...paymentList,
              id_contract_payment: createdPayment.id,
            };
            const createdList = await models.db1.ContractPaymentList.create(
              listDataToCreate,
              {
                transaction: transaction1,
              }
            );
            console.log(
              `✅ Created ContractPaymentList with ID: ${createdList.id}`
            );

            const paymentServiceData = {
              id_contract_payment: createdPayment.id,
              id_contract_payment_list: createdList.id,
              id_quotation_service,
            };
            const createdService =
              await models.db1.ContractPaymentService.create(
                paymentServiceData,
                {
                  transaction: transaction1,
                }
              );
            console.log(
              `✅ Created ContractPaymentService with ID: ${createdService.id}`
            );

            paymentListsResult.push({
              payment_list: createdList.toJSON(),
              payment_service: createdService.toJSON(),
            });
          }

          paymentsResult.push({
            payment: createdPayment.toJSON(),
            payment_lists: paymentListsResult,
          });
        }

        const progressData = {
          id_contract: contract.id,
          id_user: id_user_create,
          status: "created",
          note: replaceContractId
            ? `Contract created as replacement for Contract ID ${replaceContractId}`
            : "Contract created",
        };
        const progress = await models.db1.ContractVerificationProgress.create(
          progressData,
          {
            transaction: transaction1,
          }
        );

        await transaction1.commit();
        console.log(`✅ Contract created in DB1 only`);

        return {
          contract: contract.toJSON(),
          services: servicesResult,
          clauses: clausesResult,
          payments: paymentsResult,
          verification_progress: progress.toJSON(),
          replaced_contract_id: replaceContractId || null,
        };
      }
    } catch (error) {
      console.error(`❌ Error creating Contract:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to create Contract: ${error.message}`);
    }
  }

  /**
   * Update contract with services, clauses, clause points, and clause logs
   * @param {Number} id - Contract ID
   * @param {Object} contractData - Contract data to update
   * @param {Array} services - Contract services data
   * @param {Array} clauses - Contract clauses data
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated contract with all relations
   */
  async updateWithRelations(
    id,
    contractData,
    services = [],
    clauses = [],
    isDoubleDatabase = true
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Updating Contract ID ${id} with all relations...`);

        // 1. Update Contract in both databases
        const [updatedRows1] = await this.Model1.update(contractData, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(contractData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`Contract with ID ${id} not found`);
        }

        console.log(`✅ Updated Contract in both databases`);

        // 2. Sync Contract Services
        const servicesData = services.map((service) => ({
          ...service,
          id_contract: id,
        }));

        const servicesResult = await syncChildRecords({
          Model1: models.db1.ContractService,
          Model2: models.db2.ContractService,
          foreignKey: "id_contract",
          parentId: id,
          newData: servicesData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        console.log(`✅ Synced Contract Services`);

        // Update QuotationService for new services
        for (const service of services) {
          if (service.id_quotation_service && !service.id) {
            // Only for new services
            await models.db1.QuotationService.update(
              { is_selected_contract: true },
              {
                where: { id: service.id_quotation_service },
                transaction: transaction1,
              }
            );
            await models.db2.QuotationService.update(
              { is_selected_contract: true },
              {
                where: { id: service.id_quotation_service },
                transaction: transaction2,
              }
            );
          }
        }

        // 3. Process Contract Clauses (Create/Update/Delete)
        const clausesResult = [];

        // Get existing clause IDs
        const existingClauses = await models.db1.ContractClause.findAll({
          where: { id_contract: id },
          attributes: ["id"],
          transaction: transaction1,
        });
        const existingClauseIds = existingClauses.map((c) => c.id);

        // Separate clauses into create, update
        const clausesToCreate = clauses.filter((c) => !c.id);
        const clausesToUpdate = clauses.filter((c) => c.id);
        const clauseIdsToKeep = clausesToUpdate.map((c) => c.id);

        // Delete clauses that are not in the new data
        const clauseIdsToDelete = existingClauseIds.filter(
          (id) => !clauseIdsToKeep.includes(id)
        );

        for (const clauseId of clauseIdsToDelete) {
          // Delete clause logs first
          await models.db1.ContractClauseLog.destroy({
            where: { id_contract_clause: clauseId },
            transaction: transaction1,
          });
          await models.db2.ContractClauseLog.destroy({
            where: { id_contract_clause: clauseId },
            transaction: transaction2,
          });

          // Delete clause points
          await models.db1.ContractClausePoint.destroy({
            where: { id_contract_clause: clauseId },
            transaction: transaction1,
          });
          await models.db2.ContractClausePoint.destroy({
            where: { id_contract_clause: clauseId },
            transaction: transaction2,
          });

          // Delete clause
          await models.db1.ContractClause.destroy({
            where: { id: clauseId },
            transaction: transaction1,
          });
          await models.db2.ContractClause.destroy({
            where: { id: clauseId },
            transaction: transaction2,
          });

          console.log(`🗑️ Deleted Clause ID: ${clauseId}`);
        }

        // Create new clauses
        for (const clauseData of clausesToCreate) {
          const { clause_point = [], clause_logs = [], ...clause } = clauseData;

          const clauseDataToCreate = {
            ...clause,
            id_contract: id,
          };

          const clause1 = await models.db1.ContractClause.create(
            clauseDataToCreate,
            { transaction: transaction1 }
          );

          const clauseDataWithId = {
            ...clauseDataToCreate,
            id: clause1.id,
          };
          await models.db2.ContractClause.create(clauseDataWithId, {
            transaction: transaction2,
          });

          console.log(`✅ Created new Clause with ID: ${clause1.id}`);

          // Process Clause Points with their own clause_logs
          const clausePointsResult = [];
          for (const pointData of clause_point) {
            const { clause_logs: pointLogs = [], ...point } = pointData;

            const pointDataToCreate = {
              ...point,
              id_contract_clause: clause1.id,
            };

            const point1 = await models.db1.ContractClausePoint.create(
              pointDataToCreate,
              { transaction: transaction1 }
            );

            const pointDataWithId = {
              ...pointDataToCreate,
              id: point1.id,
            };
            await models.db2.ContractClausePoint.create(pointDataWithId, {
              transaction: transaction2,
            });

            // Sync Clause Logs for this Clause Point
            const pointLogsData = pointLogs.map((log) => ({
              ...log,
              id_contract_clause: clause1.id,
              id_contract_clause_point: point1.id,
            }));

            const pointLogsResult = await syncChildRecords({
              Model1: models.db1.ContractClauseLog,
              Model2: models.db2.ContractClauseLog,
              foreignKey: "id_contract_clause_point",
              parentId: point1.id,
              newData: pointLogsData,
              transaction1,
              transaction2,
              isDoubleDatabase,
            });

            clausePointsResult.push({
              clause_point: point1.toJSON(),
              clause_logs: pointLogsResult,
            });
          }

          // Sync Clause Logs for the Clause itself
          const clauseLogsData = clause_logs.map((log) => ({
            ...log,
            id_contract_clause: clause1.id,
            id_contract_clause_point: null,
          }));

          const clauseLogsResult = await syncChildRecords({
            Model1: models.db1.ContractClauseLog,
            Model2: models.db2.ContractClauseLog,
            foreignKey: "id_contract_clause",
            parentId: clause1.id,
            newData: clauseLogsData,
            transaction1,
            transaction2,
            isDoubleDatabase,
          });

          clausesResult.push({
            clause: clause1.toJSON(),
            clause_points: clausePointsResult,
            clause_logs: clauseLogsResult,
          });
        }

        // Update existing clauses
        for (const clauseData of clausesToUpdate) {
          const {
            id: clauseId,
            clause_point = [],
            clause_logs = [],
            ...clause
          } = clauseData;

          await models.db1.ContractClause.update(clause, {
            where: { id: clauseId },
            transaction: transaction1,
          });

          await models.db2.ContractClause.update(clause, {
            where: { id: clauseId },
            transaction: transaction2,
          });

          console.log(`✅ Updated Clause ID: ${clauseId}`);

          // Get existing clause points for this clause
          const existingPoints = await models.db1.ContractClausePoint.findAll({
            where: { id_contract_clause: clauseId },
            attributes: ["id"],
            transaction: transaction1,
          });
          const existingPointIds = existingPoints.map((p) => p.id);

          // Separate points into create, update
          const pointsToCreate = clause_point.filter((p) => !p.id);
          const pointsToUpdate = clause_point.filter((p) => p.id);
          const pointIdsToKeep = pointsToUpdate.map((p) => p.id);

          // Delete points that are not in the new data
          const pointIdsToDelete = existingPointIds.filter(
            (id) => !pointIdsToKeep.includes(id)
          );

          for (const pointId of pointIdsToDelete) {
            // Delete clause logs for this point first
            await models.db1.ContractClauseLog.destroy({
              where: { id_contract_clause_point: pointId },
              transaction: transaction1,
            });
            await models.db2.ContractClauseLog.destroy({
              where: { id_contract_clause_point: pointId },
              transaction: transaction2,
            });

            // Delete clause point
            await models.db1.ContractClausePoint.destroy({
              where: { id: pointId },
              transaction: transaction1,
            });
            await models.db2.ContractClausePoint.destroy({
              where: { id: pointId },
              transaction: transaction2,
            });

            console.log(`🗑️ Deleted Clause Point ID: ${pointId}`);
          }

          const clausePointsResult = [];

          // Create new clause points
          for (const pointData of pointsToCreate) {
            const { clause_logs: pointLogs = [], ...point } = pointData;

            const pointDataToCreate = {
              ...point,
              id_contract_clause: clauseId,
            };

            const point1 = await models.db1.ContractClausePoint.create(
              pointDataToCreate,
              { transaction: transaction1 }
            );

            const pointDataWithId = {
              ...pointDataToCreate,
              id: point1.id,
            };
            await models.db2.ContractClausePoint.create(pointDataWithId, {
              transaction: transaction2,
            });

            // Sync Clause Logs for this new Clause Point
            const pointLogsData = pointLogs.map((log) => ({
              ...log,
              id_contract_clause: clauseId,
              id_contract_clause_point: point1.id,
            }));

            const pointLogsResult = await syncChildRecords({
              Model1: models.db1.ContractClauseLog,
              Model2: models.db2.ContractClauseLog,
              foreignKey: "id_contract_clause_point",
              parentId: point1.id,
              newData: pointLogsData,
              transaction1,
              transaction2,
              isDoubleDatabase,
            });

            clausePointsResult.push({
              clause_point: point1.toJSON(),
              clause_logs: pointLogsResult,
            });
          }

          // Update existing clause points
          for (const pointData of pointsToUpdate) {
            const {
              id: pointId,
              clause_logs: pointLogs = [],
              ...point
            } = pointData;

            await models.db1.ContractClausePoint.update(point, {
              where: { id: pointId },
              transaction: transaction1,
            });

            await models.db2.ContractClausePoint.update(point, {
              where: { id: pointId },
              transaction: transaction2,
            });

            // Sync Clause Logs for this Clause Point
            const pointLogsData = pointLogs.map((log) => ({
              ...log,
              id_contract_clause: clauseId,
              id_contract_clause_point: pointId,
            }));

            const pointLogsResult = await syncChildRecords({
              Model1: models.db1.ContractClauseLog,
              Model2: models.db2.ContractClauseLog,
              foreignKey: "id_contract_clause_point",
              parentId: pointId,
              newData: pointLogsData,
              transaction1,
              transaction2,
              isDoubleDatabase,
            });

            clausePointsResult.push({
              id: pointId,
              clause_logs: pointLogsResult,
            });
          }

          // Sync Clause-level Logs (not tied to any clause_point)
          const clauseLogsData = clause_logs.map((log) => ({
            ...log,
            id_contract_clause: clauseId,
            id_contract_clause_point: null,
          }));

          const clauseLogsResult = await syncChildRecords({
            Model1: models.db1.ContractClauseLog,
            Model2: models.db2.ContractClauseLog,
            foreignKey: "id_contract_clause",
            parentId: clauseId,
            newData: clauseLogsData.filter(
              (log) => log.id_contract_clause_point === null
            ),
            transaction1,
            transaction2,
            isDoubleDatabase,
          });

          clausesResult.push({
            id: clauseId,
            clause_points: clausePointsResult,
            clause_logs: clauseLogsResult,
          });
        }

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Contract with all relations successfully updated`);

        // Get updated contract
        const updated = await this.getById(id, {}, isDoubleDatabase);

        return updated;
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const [updatedRows] = await this.Model1.update(contractData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`Contract with ID ${id} not found`);
        }

        // Sync Contract Services
        const servicesData = services.map((service) => ({
          ...service,
          id_contract: id,
        }));

        const servicesResult = await syncChildRecords({
          Model1: models.db1.ContractService,
          Model2: null,
          foreignKey: "id_contract",
          parentId: id,
          newData: servicesData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        // Update QuotationService for new services
        for (const service of services) {
          if (service.id_quotation_service && !service.id) {
            await models.db1.QuotationService.update(
              { is_selected_contract: true },
              {
                where: { id: service.id_quotation_service },
                transaction: transaction1,
              }
            );
          }
        }

        // Process Contract Clauses
        const clausesResult = [];

        const existingClauses = await models.db1.ContractClause.findAll({
          where: { id_contract: id },
          attributes: ["id"],
          transaction: transaction1,
        });
        const existingClauseIds = existingClauses.map((c) => c.id);

        const clausesToCreate = clauses.filter((c) => !c.id);
        const clausesToUpdate = clauses.filter((c) => c.id);
        const clauseIdsToKeep = clausesToUpdate.map((c) => c.id);

        const clauseIdsToDelete = existingClauseIds.filter(
          (id) => !clauseIdsToKeep.includes(id)
        );

        for (const clauseId of clauseIdsToDelete) {
          await models.db1.ContractClauseLog.destroy({
            where: { id_contract_clause: clauseId },
            transaction: transaction1,
          });

          await models.db1.ContractClausePoint.destroy({
            where: { id_contract_clause: clauseId },
            transaction: transaction1,
          });

          await models.db1.ContractClause.destroy({
            where: { id: clauseId },
            transaction: transaction1,
          });
        }

        // Create new clauses
        for (const clauseData of clausesToCreate) {
          const { clause_point = [], clause_logs = [], ...clause } = clauseData;

          const clauseDataToCreate = {
            ...clause,
            id_contract: id,
          };

          const createdClause = await models.db1.ContractClause.create(
            clauseDataToCreate,
            { transaction: transaction1 }
          );

          // Process Clause Points with their own clause_logs
          const clausePointsResult = [];
          for (const pointData of clause_point) {
            const { clause_logs: pointLogs = [], ...point } = pointData;

            const pointDataToCreate = {
              ...point,
              id_contract_clause: createdClause.id,
            };

            const createdPoint = await models.db1.ContractClausePoint.create(
              pointDataToCreate,
              { transaction: transaction1 }
            );

            // Sync Clause Logs for this Clause Point
            const pointLogsData = pointLogs.map((log) => ({
              ...log,
              id_contract_clause: createdClause.id,
              id_contract_clause_point: createdPoint.id,
            }));

            const pointLogsResult = await syncChildRecords({
              Model1: models.db1.ContractClauseLog,
              Model2: null,
              foreignKey: "id_contract_clause_point",
              parentId: createdPoint.id,
              newData: pointLogsData,
              transaction1,
              transaction2: null,
              isDoubleDatabase: false,
            });

            clausePointsResult.push({
              clause_point: createdPoint.toJSON(),
              clause_logs: pointLogsResult,
            });
          }

          // Sync Clause Logs for the Clause itself
          const clauseLogsData = clause_logs.map((log) => ({
            ...log,
            id_contract_clause: createdClause.id,
            id_contract_clause_point: null,
          }));

          const clauseLogsResult = await syncChildRecords({
            Model1: models.db1.ContractClauseLog,
            Model2: null,
            foreignKey: "id_contract_clause",
            parentId: createdClause.id,
            newData: clauseLogsData,
            transaction1,
            transaction2: null,
            isDoubleDatabase: false,
          });

          clausesResult.push({
            clause: createdClause.toJSON(),
            clause_points: clausePointsResult,
            clause_logs: clauseLogsResult,
          });
        }

        // Update existing clauses
        for (const clauseData of clausesToUpdate) {
          const {
            id: clauseId,
            clause_point = [],
            clause_logs = [],
            ...clause
          } = clauseData;

          await models.db1.ContractClause.update(clause, {
            where: { id: clauseId },
            transaction: transaction1,
          });

          // Get existing clause points for this clause
          const existingPoints = await models.db1.ContractClausePoint.findAll({
            where: { id_contract_clause: clauseId },
            attributes: ["id"],
            transaction: transaction1,
          });
          const existingPointIds = existingPoints.map((p) => p.id);

          // Separate points into create, update
          const pointsToCreate = clause_point.filter((p) => !p.id);
          const pointsToUpdate = clause_point.filter((p) => p.id);
          const pointIdsToKeep = pointsToUpdate.map((p) => p.id);

          // Delete points that are not in the new data
          const pointIdsToDelete = existingPointIds.filter(
            (id) => !pointIdsToKeep.includes(id)
          );

          for (const pointId of pointIdsToDelete) {
            // Delete clause logs for this point first
            await models.db1.ContractClauseLog.destroy({
              where: { id_contract_clause_point: pointId },
              transaction: transaction1,
            });

            // Delete clause point
            await models.db1.ContractClausePoint.destroy({
              where: { id: pointId },
              transaction: transaction1,
            });
          }

          const clausePointsResult = [];

          // Create new clause points
          for (const pointData of pointsToCreate) {
            const { clause_logs: pointLogs = [], ...point } = pointData;

            const pointDataToCreate = {
              ...point,
              id_contract_clause: clauseId,
            };

            const createdPoint = await models.db1.ContractClausePoint.create(
              pointDataToCreate,
              { transaction: transaction1 }
            );

            // Sync Clause Logs for this new Clause Point
            const pointLogsData = pointLogs.map((log) => ({
              ...log,
              id_contract_clause: clauseId,
              id_contract_clause_point: createdPoint.id,
            }));

            const pointLogsResult = await syncChildRecords({
              Model1: models.db1.ContractClauseLog,
              Model2: null,
              foreignKey: "id_contract_clause_point",
              parentId: createdPoint.id,
              newData: pointLogsData,
              transaction1,
              transaction2: null,
              isDoubleDatabase: false,
            });

            clausePointsResult.push({
              clause_point: createdPoint.toJSON(),
              clause_logs: pointLogsResult,
            });
          }

          // Update existing clause points
          for (const pointData of pointsToUpdate) {
            const {
              id: pointId,
              clause_logs: pointLogs = [],
              ...point
            } = pointData;

            await models.db1.ContractClausePoint.update(point, {
              where: { id: pointId },
              transaction: transaction1,
            });

            // Sync Clause Logs for this Clause Point
            const pointLogsData = pointLogs.map((log) => ({
              ...log,
              id_contract_clause: clauseId,
              id_contract_clause_point: pointId,
            }));

            const pointLogsResult = await syncChildRecords({
              Model1: models.db1.ContractClauseLog,
              Model2: null,
              foreignKey: "id_contract_clause_point",
              parentId: pointId,
              newData: pointLogsData,
              transaction1,
              transaction2: null,
              isDoubleDatabase: false,
            });

            clausePointsResult.push({
              id: pointId,
              clause_logs: pointLogsResult,
            });
          }

          // Sync Clause-level Logs (not tied to any clause_point)
          const clauseLogsData = clause_logs.map((log) => ({
            ...log,
            id_contract_clause: clauseId,
            id_contract_clause_point: null,
          }));

          const clauseLogsResult = await syncChildRecords({
            Model1: models.db1.ContractClauseLog,
            Model2: null,
            foreignKey: "id_contract_clause",
            parentId: clauseId,
            newData: clauseLogsData.filter(
              (log) => log.id_contract_clause_point === null
            ),
            transaction1,
            transaction2: null,
            isDoubleDatabase: false,
          });

          clausesResult.push({
            id: clauseId,
            clause_points: clausePointsResult,
            clause_logs: clauseLogsResult,
          });
        }

        await transaction1.commit();
        console.log(`✅ Contract updated in DB1 only`);

        const updated = await this.getById(id, {}, isDoubleDatabase);

        return updated;
      }
    } catch (error) {
      console.error(`❌ Error updating Contract:`, error.message);

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(`Failed to update Contract: ${error.message}`);
    }
  }

  /**
   * Submit contract - change status to "on verification" and add progress
   * @param {Number} id - Contract ID
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated contract
   */
  async submitContract(id, note, id_user, isDoubleDatabase = true) {
    return await this._changeStatusWithProgress(
      id,
      "on verification",
      "submited",
      note,
      note,
      id_user,
      isDoubleDatabase
    );
  }

  /**
   * Approve contract - change status to "approved" and add progress with note
   * @param {Number} id - Contract ID
   * @param {String} note - Approval note
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated contract
   */
  async approveContract(id, note, id_user, isDoubleDatabase = true) {
    return await this._changeStatusWithProgress(
      id,
      "approved",
      "approved",
      note || "Contract approved",
      note,
      id_user,
      isDoubleDatabase
    );
  }

  /**
   * Reject contract - change status to "rejected" and add progress with note
   * @param {Number} id - Contract ID
   * @param {String} note - Rejection note
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated contract
   */
  async rejectContract(id, note, id_user, isDoubleDatabase = true) {
    return await this._changeStatusWithProgress(
      id,
      "rejected",
      "rejected",
      note || "Contract rejected",
      note,
      id_user,
      isDoubleDatabase
    );
  }

  /**
   * Send contract to customer - change status and add progress with note
   * @param {Number} id - Contract ID
   * @param {String} note - Note
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated contract
   */
  async sendToCustomer(id, note, id_user, isDoubleDatabase = true) {
    return await this._changeStatusWithProgress(
      id,
      "sending to customer",
      "sending to customer",
      note || "Contract sent to customer",
      note,
      id_user,
      isDoubleDatabase
    );
  }

  /**
   * Customer approves contract - change status and add progress with note
   * @param {Number} id - Contract ID
   * @param {String} note - Note
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated contract
   */
  async approveByCustomer(id, note, id_user, isDoubleDatabase = true) {
    return await this._changeStatusWithProgress(
      id,
      "approve by customer",
      "approve by customer",
      note || "Contract approved by customer",
      note,
      id_user,
      isDoubleDatabase
    );
  }

  /**
   * Customer rejects contract - change status and add progress with note
   * @param {Number} id - Contract ID
   * @param {String} note - Note
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated contract
   */
  async rejectByCustomer(id, note, id_user, isDoubleDatabase = true) {
    return await this._changeStatusWithProgress(
      id,
      "reject by customer",
      "reject by customer",
      note || "Contract rejected by customer",
      note,
      id_user,
      isDoubleDatabase
    );
  }

  /**
   * Internal method to change contract status and add verification progress
   * @param {Number} id - Contract ID
   * @param {String} contractStatus - New contract status
   * @param {String} progressStatus - Verification progress status
   * @param {String} progressNote - Note for progress
   * @param {String} contractNote - Note to update in contract (optional)
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated contract
   */
  async _changeStatusWithProgress(
    id,
    contractStatus,
    progressStatus,
    progressNote,
    contractNote = null,
    id_user,
    isDoubleDatabase = true
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Changing Contract ID ${id} status to "${contractStatus}"...`
        );

        // Prepare update data
        const updateData = { status: contractStatus };
        if (contractNote) {
          updateData.note = contractNote;
        }

        // 1. Update Contract status in both databases
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

        // 2. Create ContractVerificationProgress
        const progressData = {
          id_contract: id,
          id_user: id_user,
          status: progressStatus,
          note: progressNote,
        };

        const progress1 = await models.db1.ContractVerificationProgress.create(
          progressData,
          { transaction: transaction1 }
        );

        const progressDataWithId = {
          ...progressData,
          id: progress1.id,
        };
        await models.db2.ContractVerificationProgress.create(
          progressDataWithId,
          {
            transaction: transaction2,
          }
        );

        if (contractStatus == "approve by customer") {
          const contractService1 = await models.db1.ContractService.update(
            { is_can_processed: true },
            {
              where: { id_contract: id },
              transaction: transaction1,
            }
          );

          const contractServiceDataWithId = {
            is_can_processed: true,
            id: contractService1.id,
          };
          await models.db2.ContractService.update(contractServiceDataWithId, {
            where: { id_contract: id },
            transaction: transaction2,
          });
          console.log(`✅ Change ContractService is_can_processed to true`);
        }

        console.log(
          `✅ Created ContractVerificationProgress with status "${progressStatus}"`
        );

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(
          `✅ Contract status successfully changed to "${contractStatus}"`
        );

        // Get updated contract
        const updated = await this.getById(id, {}, isDoubleDatabase);

        return updated;
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const updateData = { status: contractStatus };
        if (contractNote) {
          updateData.note = contractNote;
        }

        const [updatedRows] = await this.Model1.update(updateData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`Contract with ID ${id} not found`);
        }

        const progressData = {
          id_contract: id,
          id_user: id_user,
          status: progressStatus,
          note: progressNote,
        };

        await models.db1.ContractVerificationProgress.create(progressData, {
          transaction: transaction1,
        });

        if (contractStatus == "approve by customer") {
          await models.db1.ContractService.update(
            { is_can_processed: true },
            {
              where: { id_contract: id },
              transaction: transaction1,
            }
          );

          console.log(
            `✅ Change ContractService is_can_processed to true in DB1 only`
          );
        }

        await transaction1.commit();
        console.log(
          `✅ Contract status changed to "${contractStatus}" in DB1 only`
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

module.exports = new ContractService();
