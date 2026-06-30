const DualDatabaseService = require("../dualDatabase.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");
const { where } = require("sequelize");

class ClauseTemplateService extends DualDatabaseService {
  constructor() {
    super("ClauseTemplate");
    // this.Model1 → models.db1.ClauseTemplate
    // this.Model2 → models.db2.ClauseTemplate
    // For Clause / ClauseHeader / ClausePoint / ClausePointSub operations
    // use models.db1.<Model> / models.db2.<Model> explicitly
  }

  // ============================================================
  // CLAUSE TEMPLATE METHODS (Top Hierarchy)
  // ============================================================

  /**
   * Get all clause templates with their clauses (+ clause_points + clause_point_sub)
   * and clause headers
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} ClauseTemplates with full nested relations
   */
  async getAllTemplatesWithRelations(options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.Clause,
          as: "clauses",
          separate: true,
          where: { is_active: true },
          attributes: [
            "id",
            "id_clause_template",
            "description_indo",
            "description_mandarin",
            "index",
            "is_active",
          ],
          include: [
            {
              model: dbModels.ClausePoint,
              as: "clause_points",
              separate: true,
              where: { is_active: true },
              attributes: [
                "id",
                "id_clause",
                "description_indo",
                "description_mandarin",
                "index",
                "is_active",
              ],
              include: [
                {
                  model: dbModels.ClausePointSub,
                  as: "clause_point_sub",
                  separate: true,
                  where: { is_active: true },
                  attributes: [
                    "id",
                    "id_clause_point",
                    "description_indo",
                    "description_mandarin",
                    "index",
                    "is_active",
                  ],
                },
              ],
            },
          ],
        },
        {
          model: dbModels.ClauseHeader,
          as: "clauses_header",
          separate: true,
          where: { is_active: true },
          attributes: [
            "id",
            "id_clause_template",
            "description_indo",
            "description_mandarin",
            "index",
            "is_view_product",
            "is_active",
          ],
        },
      ],
    };

    return await this.findAll(queryOptions, isDoubleDatabase);
  }

  /**
   * Get clause template by ID with full nested relations
   * @param {Number} id
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} ClauseTemplate with full nested relations
   */
  async getTemplateById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.Clause,
          as: "clauses",
          attributes: [
            "id",
            "id_clause_template",
            "description_indo",
            "description_mandarin",
            "index",
            "is_active",
          ],
          include: [
            {
              model: dbModels.ClausePoint,
              as: "clause_points",
              attributes: [
                "id",
                "id_clause",
                "description_indo",
                "description_mandarin",
                "index",
                "is_active",
              ],
              include: [
                {
                  model: dbModels.ClausePointSub,
                  as: "clause_point_sub",
                  attributes: [
                    "id",
                    "id_clause_point",
                    "description_indo",
                    "description_mandarin",
                    "index",
                    "is_active",
                  ],
                },
              ],
            },
          ],
        },
        {
          model: dbModels.ClauseHeader,
          as: "clauses_header",
          attributes: [
            "id",
            "id_clause_template",
            "description_indo",
            "description_mandarin",
            "index",
            "is_view_product",
            "is_active",
          ],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Create or Update a ClauseTemplate along with its clauses, clause points,
   * clause point subs, and clause headers in a single transaction.
   *
   * Hierarchy:
   *   ClauseTemplate → Clause → ClausePoint → ClausePointSub
   *   ClauseTemplate → ClauseHeader (flat, no children)
   *
   * Logic:
   * - If id_clause_template is null/undefined  => CREATE new ClauseTemplate
   * - If id_clause_template exists             => UPDATE existing ClauseTemplate
   * - For each clause in clause_list:
   *     - If clause.id is null/undefined       => CREATE new Clause
   *     - If clause.id exists                  => UPDATE existing Clause
   *     - Clauses not in the list              => DELETE
   *     - For each clause_point in clause_points:
   *         - same create/update/delete logic
   *         - For each clause_point_sub in clause_point_sub:
   *             - same create/update/delete logic (via syncChildRecords)
   * - For each clause_header in clauses_header:
   *     - same create/update/delete logic (via syncChildRecords)
   *
   * @param {Object} templateData - { id_clause_template, clause_list, clauses_header, ...templateFields }
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Processed ClauseTemplate with nested result
   */
  async upsertTemplateWithClauses(templateData = {}, isDoubleDatabase = true) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      const {
        id_clause_template,
        clause_list = [],
        clauses_header = [],
        ...templateFields
      } = templateData;

      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Processing ClauseTemplate ${
            id_clause_template ? `ID ${id_clause_template}` : "(new)"
          } with ${clause_list.length} clauses and ${
            clauses_header.length
          } headers in both databases...`
        );

        // ── Step 1: Create or Update ClauseTemplate ──────────────────────────
        let templateId;
        let template1;
        let isTemplateUpdate = false;

        if (id_clause_template) {
          isTemplateUpdate = true;
          templateId = id_clause_template;

          console.log(`🔄 Updating ClauseTemplate ID ${templateId}...`);

          const [updated1] = await this.Model1.update(templateFields, {
            where: { id: templateId },
            transaction: transaction1,
          });
          const [updated2] = await this.Model2.update(templateFields, {
            where: { id: templateId },
            transaction: transaction2,
          });

          if (updated1 === 0 && updated2 === 0) {
            throw new Error(`ClauseTemplate with ID ${templateId} not found`);
          }

          template1 = await this.Model1.findByPk(templateId, {
            transaction: transaction1,
          });

          console.log(`✅ Updated ClauseTemplate ID: ${templateId}`);
        } else {
          console.log(`🔄 Creating new ClauseTemplate...`);

          template1 = await this.Model1.create(templateFields, {
            transaction: transaction1,
          });
          templateId = template1.id;

          await this.Model2.create(
            { ...templateFields, id: templateId },
            { transaction: transaction2 }
          );

          console.log(
            `✅ Created ClauseTemplate in both DBs with ID: ${templateId}`
          );
        }

        // ── Step 2: Sync Clauses under this template ──────────────────────────
        // We use a manual loop (not syncChildRecords) because each clause has
        // nested clause_points, which themselves have nested clause_point_sub.

        const clauseResults = [];

        // Collect IDs of clauses present in the incoming list (for delete detection)
        const incomingClauseIds = clause_list
          .filter((c) => c.id)
          .map((c) => c.id);

        // Fetch existing clause IDs that belong to this template (DB1)
        const existingClauses = await models.db1.Clause.findAll({
          where: { id_clause_template: templateId },
          attributes: ["id"],
          transaction: transaction1,
        });
        const existingClauseIds = existingClauses.map((c) => c.id);

        // Determine clauses to delete (exist in DB but not in incoming list)
        const clauseIdsToDelete = existingClauseIds.filter(
          (existId) => !incomingClauseIds.includes(existId)
        );

        // Delete removed clauses (cascade will handle clause_points/sub if FK set)
        if (clauseIdsToDelete.length > 0) {
          console.log(
            `🗑️ Deleting ${
              clauseIdsToDelete.length
            } removed clause(s): [${clauseIdsToDelete.join(", ")}]`
          );

          await models.db1.Clause.destroy({
            where: { id: clauseIdsToDelete },
            transaction: transaction1,
          });
          await models.db2.Clause.destroy({
            where: { id: clauseIdsToDelete },
            transaction: transaction2,
          });
        }

        // Process each clause (create / update)
        for (const item of clause_list) {
          const { id, clause_points = [], ...clauseData } = item;

          // Strip non-column fields that may come from frontend (createdAt, updatedAt)
          const { createdAt, updatedAt, ...cleanClauseData } = clauseData;

          const clausePayload = {
            ...cleanClauseData,
            id_clause_template: templateId,
          };

          let clauseId;
          let clause1;
          let isClauseUpdate = false;

          if (id) {
            // UPDATE existing Clause
            isClauseUpdate = true;
            clauseId = id;

            console.log(`🔄 Updating Clause ID ${clauseId}...`);

            await models.db1.Clause.update(clausePayload, {
              where: { id: clauseId },
              transaction: transaction1,
            });
            await models.db2.Clause.update(clausePayload, {
              where: { id: clauseId },
              transaction: transaction2,
            });

            clause1 = await models.db1.Clause.findByPk(clauseId, {
              transaction: transaction1,
            });

            console.log(`✅ Updated Clause ID: ${clauseId}`);
          } else {
            // CREATE new Clause
            console.log(
              `🔄 Creating new Clause under Template ID ${templateId}...`
            );

            clause1 = await models.db1.Clause.create(clausePayload, {
              transaction: transaction1,
            });
            clauseId = clause1.id;

            await models.db2.Clause.create(
              { ...clausePayload, id: clauseId },
              { transaction: transaction2 }
            );

            console.log(`✅ Created Clause in both DBs with ID: ${clauseId}`);
          }

          // ── Step 3: Sync ClausePoints under this clause ───────────────────
          // Manual loop again, since each clause_point can have nested
          // clause_point_sub records.

          const clausePointResults = [];

          const incomingPointIds = clause_points
            .filter((p) => p.id)
            .map((p) => p.id);

          const existingPoints = await models.db1.ClausePoint.findAll({
            where: { id_clause: clauseId },
            attributes: ["id"],
            transaction: transaction1,
          });
          const existingPointIds = existingPoints.map((p) => p.id);

          const pointIdsToDelete = existingPointIds.filter(
            (existId) => !incomingPointIds.includes(existId)
          );

          if (pointIdsToDelete.length > 0) {
            console.log(
              `🗑️ Deleting ${
                pointIdsToDelete.length
              } removed clause_point(s): [${pointIdsToDelete.join(", ")}]`
            );

            await models.db1.ClausePoint.destroy({
              where: { id: pointIdsToDelete },
              transaction: transaction1,
            });
            await models.db2.ClausePoint.destroy({
              where: { id: pointIdsToDelete },
              transaction: transaction2,
            });
          }

          for (const pointItem of clause_points) {
            const {
              id: pointId,
              clause_point_sub = [],
              ...pointData
            } = pointItem;

            const {
              createdAt: _pca,
              updatedAt: _pua,
              id_clause: _pic,
              ...cleanPointData
            } = pointData;

            const pointPayload = {
              ...cleanPointData,
              id_clause: clauseId,
            };

            let resolvedPointId;
            let point1;
            let isPointUpdate = false;

            if (pointId) {
              isPointUpdate = true;
              resolvedPointId = pointId;

              await models.db1.ClausePoint.update(pointPayload, {
                where: { id: resolvedPointId },
                transaction: transaction1,
              });
              await models.db2.ClausePoint.update(pointPayload, {
                where: { id: resolvedPointId },
                transaction: transaction2,
              });

              point1 = await models.db1.ClausePoint.findByPk(resolvedPointId, {
                transaction: transaction1,
              });
            } else {
              point1 = await models.db1.ClausePoint.create(pointPayload, {
                transaction: transaction1,
              });
              resolvedPointId = point1.id;

              await models.db2.ClausePoint.create(
                { ...pointPayload, id: resolvedPointId },
                { transaction: transaction2 }
              );
            }

            // ── Step 4: Sync ClausePointSub under this clause_point ───────────
            const clausePointSubData = clause_point_sub.map((sub) => {
              const {
                createdAt: _sca,
                updatedAt: _sua,
                id_clause_point: _sic,
                ...cleanSub
              } = sub;
              return { ...cleanSub, id_clause_point: resolvedPointId };
            });

            const clausePointSubResult = await syncChildRecords({
              Model1: models.db1.ClausePointSub,
              Model2: models.db2.ClausePointSub,
              foreignKey: "id_clause_point",
              parentId: resolvedPointId,
              newData: clausePointSubData,
              transaction1,
              transaction2,
              isDoubleDatabase,
            });

            clausePointResults.push({
              clause_point: point1.toJSON(),
              clause_point_sub: clausePointSubResult,
              operation: isPointUpdate ? "updated" : "created",
            });
          }

          clauseResults.push({
            clause: clause1.toJSON(),
            clause_points: clausePointResults,
            operation: isClauseUpdate ? "updated" : "created",
          });
        }

        // ── Step 5: Sync ClauseHeaders under this template ────────────────────
        // Flat list, no children → syncChildRecords is sufficient.
        const clauseHeaderData = clauses_header.map((header) => {
          const {
            createdAt: _hca,
            updatedAt: _hua,
            id_clause_template: _hit,
            ...cleanHeader
          } = header;
          return { ...cleanHeader, id_clause_template: templateId };
        });

        const clauseHeaderResult = await syncChildRecords({
          Model1: models.db1.ClauseHeader,
          Model2: models.db2.ClauseHeader,
          foreignKey: "id_clause_template",
          parentId: templateId,
          newData: clauseHeaderData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();

        console.log(
          `✅ ClauseTemplate ID ${templateId} with clauses and headers successfully processed`
        );

        return {
          template: template1.toJSON(),
          clause_list: clauseResults,
          clauses_header: clauseHeaderResult,
          operation: isTemplateUpdate ? "updated" : "created",
        };
      } else {
        // ── Single Database (DB1 only) ────────────────────────────────────────
        transaction1 = await db1.transaction();

        const {
          createdAt: _ca,
          updatedAt: _ua,
          ...cleanTemplateFields
        } = templateFields;

        let templateId;
        let template;
        let isTemplateUpdate = false;

        if (id_clause_template) {
          isTemplateUpdate = true;
          templateId = id_clause_template;

          const [updated] = await this.Model1.update(cleanTemplateFields, {
            where: { id: templateId },
            transaction: transaction1,
          });

          if (updated === 0) {
            throw new Error(`ClauseTemplate with ID ${templateId} not found`);
          }

          template = await this.Model1.findByPk(templateId, {
            transaction: transaction1,
          });
        } else {
          template = await this.Model1.create(cleanTemplateFields, {
            transaction: transaction1,
          });
          templateId = template.id;
        }

        const clauseResults = [];

        const incomingClauseIds = clause_list
          .filter((c) => c.id)
          .map((c) => c.id);

        const existingClauses = await models.db1.Clause.findAll({
          where: { id_clause_template: templateId },
          attributes: ["id"],
          transaction: transaction1,
        });
        const existingClauseIds = existingClauses.map((c) => c.id);

        const clauseIdsToDelete = existingClauseIds.filter(
          (existId) => !incomingClauseIds.includes(existId)
        );

        if (clauseIdsToDelete.length > 0) {
          await models.db1.Clause.destroy({
            where: { id: clauseIdsToDelete },
            transaction: transaction1,
          });
        }

        for (const item of clause_list) {
          const { id, clause_points = [], ...clauseData } = item;
          const { createdAt, updatedAt, ...cleanClauseData } = clauseData;

          const clausePayload = {
            ...cleanClauseData,
            id_clause_template: templateId,
          };

          let clauseId;
          let clause;
          let isClauseUpdate = false;

          if (id) {
            isClauseUpdate = true;
            clauseId = id;

            await models.db1.Clause.update(clausePayload, {
              where: { id: clauseId },
              transaction: transaction1,
            });

            clause = await models.db1.Clause.findByPk(clauseId, {
              transaction: transaction1,
            });
          } else {
            clause = await models.db1.Clause.create(clausePayload, {
              transaction: transaction1,
            });
            clauseId = clause.id;
          }

          // Sync ClausePoints (+ nested ClausePointSub) for this clause
          const clausePointResults = [];

          const incomingPointIds = clause_points
            .filter((p) => p.id)
            .map((p) => p.id);

          const existingPoints = await models.db1.ClausePoint.findAll({
            where: { id_clause: clauseId },
            attributes: ["id"],
            transaction: transaction1,
          });
          const existingPointIds = existingPoints.map((p) => p.id);

          const pointIdsToDelete = existingPointIds.filter(
            (existId) => !incomingPointIds.includes(existId)
          );

          if (pointIdsToDelete.length > 0) {
            await models.db1.ClausePoint.destroy({
              where: { id: pointIdsToDelete },
              transaction: transaction1,
            });
          }

          for (const pointItem of clause_points) {
            const {
              id: pointId,
              clause_point_sub = [],
              ...pointData
            } = pointItem;

            const {
              createdAt: _pca,
              updatedAt: _pua,
              id_clause: _pic,
              ...cleanPointData
            } = pointData;

            const pointPayload = {
              ...cleanPointData,
              id_clause: clauseId,
            };

            let resolvedPointId;
            let point;
            let isPointUpdate = false;

            if (pointId) {
              isPointUpdate = true;
              resolvedPointId = pointId;

              await models.db1.ClausePoint.update(pointPayload, {
                where: { id: resolvedPointId },
                transaction: transaction1,
              });

              point = await models.db1.ClausePoint.findByPk(resolvedPointId, {
                transaction: transaction1,
              });
            } else {
              point = await models.db1.ClausePoint.create(pointPayload, {
                transaction: transaction1,
              });
              resolvedPointId = point.id;
            }

            const clausePointSubData = clause_point_sub.map((sub) => {
              const {
                createdAt: _sca,
                updatedAt: _sua,
                id_clause_point: _sic,
                ...cleanSub
              } = sub;
              return { ...cleanSub, id_clause_point: resolvedPointId };
            });

            const clausePointSubResult = await syncChildRecords({
              Model1: models.db1.ClausePointSub,
              Model2: null,
              foreignKey: "id_clause_point",
              parentId: resolvedPointId,
              newData: clausePointSubData,
              transaction1,
              transaction2: null,
              isDoubleDatabase: false,
            });

            clausePointResults.push({
              clause_point: point.toJSON(),
              clause_point_sub: clausePointSubResult,
              operation: isPointUpdate ? "updated" : "created",
            });
          }

          clauseResults.push({
            clause: clause.toJSON(),
            clause_points: clausePointResults,
            operation: isClauseUpdate ? "updated" : "created",
          });
        }

        // Sync ClauseHeaders for this template (DB1 only)
        const clauseHeaderData = clauses_header.map((header) => {
          const {
            createdAt: _hca,
            updatedAt: _hua,
            id_clause_template: _hit,
            ...cleanHeader
          } = header;
          return { ...cleanHeader, id_clause_template: templateId };
        });

        const clauseHeaderResult = await syncChildRecords({
          Model1: models.db1.ClauseHeader,
          Model2: null,
          foreignKey: "id_clause_template",
          parentId: templateId,
          newData: clauseHeaderData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        await transaction1.commit();

        console.log(`✅ ClauseTemplate ID ${templateId} processed in DB1 only`);

        return {
          template: template.toJSON(),
          clause_list: clauseResults,
          clauses_header: clauseHeaderResult,
          operation: isTemplateUpdate ? "updated" : "created",
        };
      }
    } catch (error) {
      console.error(
        `❌ Error processing ClauseTemplate with clauses:`,
        error.message
      );

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(
        `Failed to process ClauseTemplate with clauses: ${error.message}`
      );
    }
  }

  /**
   * Delete a ClauseTemplate (cascades to clauses/points/subs and headers
   * based on DB constraints)
   * @param {Number} id - ClauseTemplate ID
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Delete result
   */
  async deleteTemplate(id, isDoubleDatabase = true) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Deleting ClauseTemplate ID ${id} from both databases...`
        );

        const deleted1 = await this.Model1.update(
          { is_active: false },
          {
            where: { id },
            transaction: transaction1,
          }
        );
        const deleted2 = await this.Model2.update(
          { is_active: false },
          {
            where: { id },
            transaction: transaction2,
          }
        );

        if (deleted1 === 0 && deleted2 === 0) {
          throw new Error(`ClauseTemplate with ID ${id} not found`);
        }

        await transaction1.commit();
        await transaction2.commit();

        console.log(`✅ ClauseTemplate ID ${id} deleted from both databases`);

        return {
          deleted: true,
          message: `ClauseTemplate ID ${id} and all related clauses, clause points, clause point subs and clause headers deleted successfully`,
        };
      } else {
        transaction1 = await db1.transaction();

        const deleted = await this.Model1.update(
          { is_active: false },
          {
            where: { id },
            transaction: transaction1,
          }
        );

        if (deleted === 0) {
          throw new Error(`ClauseTemplate with ID ${id} not found`);
        }

        await transaction1.commit();

        console.log(`✅ ClauseTemplate ID ${id} deleted from DB1`);

        return {
          deleted: true,
          message: `ClauseTemplate ID ${id} and all related clauses, clause points, clause point subs and clause headers deleted successfully`,
        };
      }
    } catch (error) {
      console.error(`❌ Error deleting ClauseTemplate:`, error.message);

      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();

      throw new Error(`Failed to delete ClauseTemplate: ${error.message}`);
    }
  }
}

module.exports = new ClauseTemplateService();
