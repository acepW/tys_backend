const quotationServiceService = require("../../services/quotation/quotationService.service");

const DualDatabaseService = require("../dualDatabase.service");

const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");
const { where } = require("sequelize");

class ContractService extends DualDatabaseService {
  constructor() {
    super("Contract");
  }

  /**
   * Get all contracts with relations
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Contracts with relations
   */
  async getAllWithRelations(options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
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
          attributes: ["id", "company_name"],
        },
        {
          model: dbModels.Customer,
          as: "customer",
          attributes: ["id", "company_name"],
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
        },
        {
          model: dbModels.ContractPayment,
          as: "contract_payment",
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
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    };

    return await this.findAll(queryOptions, isDoubleDatabase);
  }

  /**
   * Get contract by ID with relations
   * @param {Number} id
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Contract with relations
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
          model: dbModels.ContractService,
          as: "services",
          include: [
            {
              model: dbModels.QuotationService,
              as: "quotation_service",
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
          ],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Create contract with services, clauses, clause points, and clause logs
   * @param {Object} contractData - Contract data
   * @param {Array} services - Contract services data
   * @param {Array} clauses - Contract clauses data
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Created contract with all relations
   */
  async createWithRelations(
    contractData,
    services = [],
    clauses = [],
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Creating Contract with all relations in both databases...`,
        );

        // 1. Create Contract in DB1
        const contract1 = await this.Model1.create(contractData, {
          transaction: transaction1,
        });
        console.log(`✅ Created Contract in DB1 with ID: ${contract1.id}`);

        // 2. Create Contract in DB2 with same ID
        const contractDataWithId = {
          ...contractData,
          id: contract1.id,
        };
        await this.Model2.create(contractDataWithId, {
          transaction: transaction2,
        });
        console.log(`✅ Created Contract in DB2 with ID: ${contract1.id}`);

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
          `✅ Synced ${servicesResult.created?.length || 0} Contract Services`,
        );

        // 4. Update QuotationService is_selected_contract = true
        for (const service of services) {
          if (service.id_quotation_service) {
            await models.db1.QuotationService.update(
              { is_selected_contract: true },
              {
                where: { id: service.id_quotation_service },
                transaction: transaction1,
              },
            );
            await models.db2.QuotationService.update(
              { is_selected_contract: true },
              {
                where: { id: service.id_quotation_service },
                transaction: transaction2,
              },
            );
          }
        }
        console.log(`✅ Updated QuotationService is_selected_contract to true`);

        // 5. Process Contract Clauses
        const clausesResult = [];
        for (const clauseData of clauses) {
          const { clause_point = [], clause_logs = [], ...clause } = clauseData;

          // Create Clause
          const clauseDataToCreate = {
            ...clause,
            id_contract: contract1.id,
          };

          const clause1 = await models.db1.ContractClause.create(
            clauseDataToCreate,
            { transaction: transaction1 },
          );

          const clauseDataWithId = {
            ...clauseDataToCreate,
            id: clause1.id,
          };
          await models.db2.ContractClause.create(clauseDataWithId, {
            transaction: transaction2,
          });

          console.log(`✅ Created Contract Clause with ID: ${clause1.id}`);

          // Process Clause Points with their own clause_logs
          const clausePointsResult = [];
          for (const pointData of clause_point) {
            const { clause_logs: pointLogs = [], ...point } = pointData;

            // Create Clause Point
            const pointDataToCreate = {
              ...point,
              id_contract_clause: clause1.id,
            };

            console.log("caluse", pointDataToCreate);

            const point1 = await models.db1.ContractClausePoint.create(
              pointDataToCreate,
              { transaction: transaction1 },
            );

            const pointDataWithId = {
              ...pointDataToCreate,
              id: point1.id,
            };
            await models.db2.ContractClausePoint.create(pointDataWithId, {
              transaction: transaction2,
            });

            console.log(`✅ Created Clause Point with ID: ${point1.id}`);

            // Sync Clause Logs for this Clause Point
            const pointLogsData = pointLogs.map((log) => ({
              ...log,
              id_contract_clause_point: point1.id,
            }));

            console.log("logs point", pointLogsData);

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
              } Clause Logs for Clause Point ${point1.id}`,
            );

            clausePointsResult.push({
              clause_point: point1.toJSON(),
              clause_logs: pointLogsResult,
            });
          }

          // Sync Clause Logs for the Clause itself (not tied to any clause_point)
          const clauseLogsData = clause_logs.map((log) => ({
            ...log,
            id_contract_clause: clause1.id,
          }));

          console.log("logs clause", clauseLogsData);

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
            } Clause-level Logs for Clause ${clause1.id}`,
          );

          clausesResult.push({
            clause: clause1.toJSON(),
            clause_points: clausePointsResult,
            clause_logs: clauseLogsResult,
          });
        }

        // 6. Create initial ContractVerificationProgress with status "created"
        const progressData = {
          id_contract: contract1.id,
          status: "created",
          note: "Contract created",
        };

        const progress1 = await models.db1.ContractVerificationProgress.create(
          progressData,
          { transaction: transaction1 },
        );

        const progressDataWithId = {
          ...progressData,
          id: progress1.id,
        };
        await models.db2.ContractVerificationProgress.create(
          progressDataWithId,
          {
            transaction: transaction2,
          },
        );

        console.log(
          `✅ Created ContractVerificationProgress with status "created"`,
        );

        const dataPaymentQuotation1 = await models.db1.QuotationPayment.findAll(
          {
            where: { id_quotation: contractData.id_quotation },
            include: [
              {
                model: models.db1.QuotationPaymentList,
                as: "quotation_payment_list",
                include: [
                  {
                    model: models.db1.QuotationPaymentService,
                    as: "quotation_payment_services",
                  },
                ],
              },
            ],
          },
        );

        // 7. Process Contract Payments
        const paymentsResult = [];
        for (const paymentRaw of dataPaymentQuotation1) {
          const paymentData = paymentRaw.toJSON(); // tambahkan ini
          const { quotation_payment_list = [], ...payment } = paymentData;

          // Create ContractPayment
          const paymentDataToCreate = {
            id_contract: contract1.id,
            payment_time_indo: payment.payment_time_indo,
            payment_time_mandarin: payment.payment_time_mandarin,
            total_payment_idr: payment.total_payment_idr,
            total_payment_rmb: payment.total_payment_rmb,
            currency_type: payment.currency_type,
            payment_to: payment.payment_to,
            is_active: payment.is_active,
          };

          console.log(paymentDataToCreate);

          const payment1 = await models.db1.ContractPayment.create(
            paymentDataToCreate,
            { transaction: transaction1 },
          );

          const paymentDataWithId = {
            ...paymentDataToCreate,
            id: payment1.id,
          };
          await models.db2.ContractPayment.create(paymentDataWithId, {
            transaction: transaction2,
          });

          console.log(`✅ Created ContractPayment with ID: ${payment1.id}`);

          // Process Payment Lists
          const paymentListsResult = [];
          for (const listData of quotation_payment_list) {
            const { quotation_payment_services = [], ...list } = listData;

            // Create ContractPaymentList
            const listDataToCreate = {
              id_contract_payment: payment1.id,
              service_name_indo: list.service_name_indo,
              service_name_mandarin: list.service_name_mandarin,
              price_idr: list.price_idr,
              price_rmb: list.price_rmb,
              payment_type: list.payment_type,
              is_active: list.is_active,
            };

            const list1 = await models.db1.ContractPaymentList.create(
              listDataToCreate,
              { transaction: transaction1 },
            );

            const listDataWithId = {
              ...listDataToCreate,
              id: list1.id,
            };
            await models.db2.ContractPaymentList.create(listDataWithId, {
              transaction: transaction2,
            });

            console.log(`✅ Created ContractPaymentList with ID: ${list1.id}`);

            // Sync ContractPaymentServices for this list
            const paymentServicesData = quotation_payment_services.map(
              (service) => ({
                id_contract_payment: payment1.id,
                id_contract_payment_list: list1.id,
                id_quotation_service: service.id_quotation_service,
                is_active: service.is_active,
              }),
            );

            const paymentServicesResult = await syncChildRecords({
              Model1: models.db1.ContractPaymentService,
              Model2: models.db2.ContractPaymentService,
              foreignKey: "id_contract_payment_list",
              parentId: list1.id,
              newData: paymentServicesData,
              transaction1,
              transaction2,
              isDoubleDatabase,
            });

            console.log(
              `✅ Synced ${paymentServicesResult.created?.length || 0} ContractPaymentServices for List ${list1.id}`,
            );

            paymentListsResult.push({
              payment_list: list1.toJSON(),
              payment_services: paymentServicesResult,
            });
          }

          paymentsResult.push({
            payment: payment1.toJSON(),
            payment_lists: paymentListsResult,
          });
        }

        console.log(`✅ Processed ${paymentsResult.length} Contract Payments`);

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ Contract with all relations successfully created`);

        return {
          contract: contract1.toJSON(),
          services: servicesResult,
          clauses: clausesResult,
          payments: paymentsResult,
          verification_progress: progress1.toJSON(),
        };
      } else {
        // Single database (DB2 only)
        transaction1 = await db1.transaction();

        const contract = await this.Model1.create(contractData, {
          transaction: transaction1,
        });

        // Sync Contract Services
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

        // Update QuotationService
        for (const service of services) {
          if (service.id_quotation_service) {
            await models.db1.QuotationService.update(
              { is_selected_contract: true },
              {
                where: { id: service.id_quotation_service },
                transaction: transaction1,
              },
            );
          }
        }

        // Process Contract Clauses
        const clausesResult = [];
        for (const clauseData of clauses) {
          const { clause_point = [], clause_logs = [], ...clause } = clauseData;

          const clauseDataToCreate = {
            ...clause,
            id_contract: contract.id,
          };

          const createdClause = await models.db1.ContractClause.create(
            clauseDataToCreate,
            { transaction: transaction1 },
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
              { transaction: transaction1 },
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

        // Create initial ContractVerificationProgress
        const progressData = {
          id_contract: contract.id,
          status: "created",
          note: "Contract created",
        };

        const progress = await models.db1.ContractVerificationProgress.create(
          progressData,
          { transaction: transaction1 },
        );

        await transaction1.commit();
        console.log(`✅ Contract created in DB1 only`);

        return {
          contract: contract.toJSON(),
          services: servicesResult,
          clauses: clausesResult,
          verification_progress: progress.toJSON(),
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
    isDoubleDatabase = true,
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
              },
            );
            await models.db2.QuotationService.update(
              { is_selected_contract: true },
              {
                where: { id: service.id_quotation_service },
                transaction: transaction2,
              },
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
          (id) => !clauseIdsToKeep.includes(id),
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
            { transaction: transaction1 },
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
              { transaction: transaction1 },
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
            (id) => !pointIdsToKeep.includes(id),
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
              { transaction: transaction1 },
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
              (log) => log.id_contract_clause_point === null,
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
              },
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
          (id) => !clauseIdsToKeep.includes(id),
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
            { transaction: transaction1 },
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
              { transaction: transaction1 },
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
            (id) => !pointIdsToKeep.includes(id),
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
              { transaction: transaction1 },
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
              (log) => log.id_contract_clause_point === null,
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
  async submitContract(id, note, isDoubleDatabase = true) {
    return await this._changeStatusWithProgress(
      id,
      "on verification",
      "submited",
      note,
      note,
      isDoubleDatabase,
    );
  }

  /**
   * Approve contract - change status to "approved" and add progress with note
   * @param {Number} id - Contract ID
   * @param {String} note - Approval note
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated contract
   */
  async approveContract(id, note, isDoubleDatabase = true) {
    return await this._changeStatusWithProgress(
      id,
      "approved",
      "approved",
      note || "Contract approved",
      note,
      isDoubleDatabase,
    );
  }

  /**
   * Reject contract - change status to "rejected" and add progress with note
   * @param {Number} id - Contract ID
   * @param {String} note - Rejection note
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated contract
   */
  async rejectContract(id, note, isDoubleDatabase = true) {
    return await this._changeStatusWithProgress(
      id,
      "rejected",
      "rejected",
      note || "Contract rejected",
      note,
      isDoubleDatabase,
    );
  }

  /**
   * Send contract to customer - change status and add progress with note
   * @param {Number} id - Contract ID
   * @param {String} note - Note
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated contract
   */
  async sendToCustomer(id, note, isDoubleDatabase = true) {
    return await this._changeStatusWithProgress(
      id,
      "sending to customer",
      "sending to customer",
      note || "Contract sent to customer",
      note,
      isDoubleDatabase,
    );
  }

  /**
   * Customer approves contract - change status and add progress with note
   * @param {Number} id - Contract ID
   * @param {String} note - Note
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated contract
   */
  async approveByCustomer(id, note, isDoubleDatabase = true) {
    return await this._changeStatusWithProgress(
      id,
      "approve by customer",
      "approve by customer",
      note || "Contract approved by customer",
      note,
      isDoubleDatabase,
    );
  }

  /**
   * Customer rejects contract - change status and add progress with note
   * @param {Number} id - Contract ID
   * @param {String} note - Note
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated contract
   */
  async rejectByCustomer(id, note, isDoubleDatabase = true) {
    return await this._changeStatusWithProgress(
      id,
      "reject by customer",
      "reject by customer",
      note || "Contract rejected by customer",
      note,
      isDoubleDatabase,
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
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Changing Contract ID ${id} status to "${contractStatus}"...`,
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
          status: progressStatus,
          note: progressNote,
        };

        const progress1 = await models.db1.ContractVerificationProgress.create(
          progressData,
          { transaction: transaction1 },
        );

        const progressDataWithId = {
          ...progressData,
          id: progress1.id,
        };
        await models.db2.ContractVerificationProgress.create(
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
          `✅ Contract status successfully changed to "${contractStatus}"`,
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
          status: progressStatus,
          note: progressNote,
        };

        await models.db1.ContractVerificationProgress.create(progressData, {
          transaction: transaction1,
        });

        await transaction1.commit();
        console.log(
          `✅ Contract status changed to "${contractStatus}" in DB1 only`,
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
