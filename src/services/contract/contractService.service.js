const DualDatabaseService = require("../dualDatabase.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");
const { where } = require("sequelize");

class ContractService extends DualDatabaseService {
  constructor() {
    super("ContractService");
  }

  /**
   * Get all contracts with relations
   * @param {Object} options - Query options
   * @param {Number} page - Page number for pagination
   * @param {Number} limit - Number of records per page
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Contracts with relations
   */
  async getAllWithRelations(
    options = {},
    optionsContract = {},
    page = null,
    limit = null,
    isDoubleDatabase = true,
  ) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.Contract,
          as: "contract",
          ...optionsContract,
          attributes: [
            "id",
            "id_company",
            "id_customer",
            "date",
            "contract_no",
            "contract_title_indo",
            "contract_title_mandarin",
            "contract_type",
            "note",
          ],
          include: [
            {
              model: dbModels.Company,
              as: "company",
            },
            {
              model: dbModels.Customer,
              as: "customer",
            },
          ],
        },
        {
          model: dbModels.QuotationService,
          as: "quotation_service",
          include: [
            {
              model: dbModels.ServicePricing,
              as: "service_pricing",
              attributes: ["id", "processing_time"],
              include: [
                {
                  model: dbModels.ProjectPlan,
                  as: "project_plans",
                  include: [
                    {
                      model: dbModels.ProjectPlanPoint,
                      as: "project_plan_points",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          model: dbModels.ContractProjectPlan,
          as: "contract_project_plans",
          include: [
            {
              model: dbModels.ContractProjectPlanPoint,
              as: "contract_project_plan_points",
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
      order: [["createdAt", "DESC"]],
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
   * Get contract by ID with relations
   * @param {Number} id
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Contract with relations
   */
  async getById(
    id,
    options = {},
    optionsContract = {},
    isDoubleDatabase = true,
  ) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.Contract,
          as: "contract",
          ...optionsContract,
          attributes: [
            "id",
            "id_company",
            "id_customer",
            "date",
            "contract_no",
            "contract_title_indo",
            "contract_title_mandarin",
            "contract_type",
            "note",
          ],
          include: [
            {
              model: dbModels.Company,
              as: "company",
            },
            {
              model: dbModels.Customer,
              as: "customer",
            },
          ],
        },
        {
          model: dbModels.QuotationService,
          as: "quotation_service",
          include: [
            {
              model: dbModels.ServicePricing,
              as: "service_pricing",
              attributes: ["id", "processing_time"],
              include: [
                {
                  model: dbModels.ProjectPlan,
                  as: "project_plans",
                  include: [
                    {
                      model: dbModels.ProjectPlanPoint,
                      as: "project_plan_points",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          model: dbModels.ContractProjectPlan,
          as: "contract_project_plans",
          include: [
            {
              model: dbModels.ContractProjectPlanPoint,
              as: "contract_project_plan_points",
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
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }
}

module.exports = new ContractService();
