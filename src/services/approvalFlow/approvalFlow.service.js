const DualDatabaseService = require("../dualDatabase.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");

class ApprovalFlowService extends DualDatabaseService {
  constructor() {
    super("ApprovalFlow");
  }

  /**
   * Get all approval flows with relations
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
          model: dbModels.ApprovalFlowPosition,
          as: "approval_flow_positions",
          separate: true,
          include: [
            {
              model: dbModels.Position,
              as: "position",
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
   * Get approval flow by ID with relations
   */
  async getById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.ApprovalFlowPosition,
          as: "approval_flow_positions",
          include: [
            {
              model: dbModels.Position,
              as: "position",
            },
          ],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Create approval flow with positions
   * @param {Object} approvalFlowData - ApprovalFlow data
   * @param {Array} approvalFlowPositions - Array of position items
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Created approval flow with relations
   */
  async createWithRelations(
    approvalFlowData,
    approvalFlowPositions = [],
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      const dataToCreate = {
        ...approvalFlowData,
        is_active: approvalFlowData.is_active ?? true,
      };

      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Creating ApprovalFlow with relations in both databases...`,
        );

        // 1. Create ApprovalFlow in DB1
        const approvalFlow1 = await this.Model1.create(dataToCreate, {
          transaction: transaction1,
        });
        console.log(
          `✅ Created ApprovalFlow in DB1 with ID: ${approvalFlow1.id}`,
        );

        // 2. Create ApprovalFlow in DB2 with same ID
        await this.Model2.create(
          { ...dataToCreate, id: approvalFlow1.id },
          { transaction: transaction2 },
        );
        console.log(
          `✅ Created ApprovalFlow in DB2 with ID: ${approvalFlow1.id}`,
        );

        // 3. Sync ApprovalFlow Positions
        const positionsData = approvalFlowPositions.map((pos) => ({
          ...pos,
          id_approval_flow: approvalFlow1.id,
        }));

        const positionsResult = await syncChildRecords({
          Model1: models.db1.ApprovalFlowPosition,
          Model2: models.db2.ApprovalFlowPosition,
          foreignKey: "id_approval_flow",
          parentId: approvalFlow1.id,
          newData: positionsData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        console.log(
          `✅ Synced ${positionsResult.created?.length || 0} ApprovalFlow Positions`,
        );

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ ApprovalFlow with relations successfully created`);

        return {
          approval_flow: approvalFlow1.toJSON(),
          approval_flow_positions: positionsResult,
        };
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const approvalFlow = await this.Model1.create(dataToCreate, {
          transaction: transaction1,
        });

        const positionsData = approvalFlowPositions.map((pos) => ({
          ...pos,
          id_approval_flow: approvalFlow.id,
        }));

        const positionsResult = await syncChildRecords({
          Model1: models.db1.ApprovalFlowPosition,
          Model2: null,
          foreignKey: "id_approval_flow",
          parentId: approvalFlow.id,
          newData: positionsData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        console.log(
          `✅ Synced ${positionsResult.created?.length || 0} ApprovalFlow Positions`,
        );

        await transaction1.commit();
        console.log(`✅ ApprovalFlow created in DB1 only`);

        return {
          approval_flow: approvalFlow.toJSON(),
          approval_flow_positions: positionsResult,
        };
      }
    } catch (error) {
      console.error(`❌ Error creating ApprovalFlow:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to create ApprovalFlow: ${error.message}`);
    }
  }

  /**
   * Update approval flow with positions (create/update/delete)
   * @param {Number} id - ApprovalFlow ID
   * @param {Object} approvalFlowData - ApprovalFlow data to update
   * @param {Array} approvalFlowPositions - Positions array
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated approval flow with all relations
   */
  async updateWithRelations(
    id,
    approvalFlowData,
    approvalFlowPositions = [],
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Updating ApprovalFlow ID ${id} with positions...`);

        // 1. Update ApprovalFlow in both databases
        const [updatedRows1] = await this.Model1.update(approvalFlowData, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(approvalFlowData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`ApprovalFlow with ID ${id} not found`);
        }

        console.log(`✅ Updated ApprovalFlow in both databases`);

        // 2. Sync ApprovalFlow Positions
        const positionsData = approvalFlowPositions.map((pos) => ({
          ...pos,
          id_approval_flow: id,
        }));

        const positionsResult = await syncChildRecords({
          Model1: models.db1.ApprovalFlowPosition,
          Model2: models.db2.ApprovalFlowPosition,
          foreignKey: "id_approval_flow",
          parentId: id,
          newData: positionsData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        console.log(`✅ Synced ApprovalFlow Positions`);

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ ApprovalFlow with all relations successfully updated`);

        return await this.getById(id, {}, isDoubleDatabase);
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const [updatedRows] = await this.Model1.update(approvalFlowData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`ApprovalFlow with ID ${id} not found`);
        }

        const positionsData = approvalFlowPositions.map((pos) => ({
          ...pos,
          id_approval_flow: id,
        }));

        await syncChildRecords({
          Model1: models.db1.ApprovalFlowPosition,
          Model2: null,
          foreignKey: "id_approval_flow",
          parentId: id,
          newData: positionsData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        await transaction1.commit();
        console.log(`✅ ApprovalFlow updated in DB1 only`);

        return await this.getById(id, {}, isDoubleDatabase);
      }
    } catch (error) {
      console.error(`❌ Error updating ApprovalFlow:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to update ApprovalFlow: ${error.message}`);
    }
  }
}

module.exports = new ApprovalFlowService();
