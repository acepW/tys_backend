const DualDatabaseService = require("../dualDatabase.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");
const { where } = require("sequelize");

class ClauseTemplateService extends DualDatabaseService {
  constructor() {
    super("ClauseTemplate");
  }

  // ============================================================
  // CLAUSE TEMPLATE METHODS (Top Hierarchy)
  // ============================================================

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
                  include: [
                    {
                      model: dbModels.ClausePointSubChild,
                      as: "clause_point_sub_child",
                      separate: true,
                      where: { is_active: true },
                      attributes: [
                        "id",
                        "id_clause_point_sub",
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
        {
          model: dbModels.ClauseFooter,
          as: "clauses_footer",
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
        },
      ],
    };

    return await this.findAll(queryOptions, isDoubleDatabase);
  }

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
                  include: [
                    {
                      model: dbModels.ClausePointSubChild,
                      as: "clause_point_sub_child",
                      attributes: [
                        "id",
                        "id_clause_point_sub",
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
        {
          model: dbModels.ClauseFooter,
          as: "clauses_footer",
          attributes: [
            "id",
            "id_clause_template",
            "description_indo",
            "description_mandarin",
            "index",
            "is_active",
          ],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Create or Update a ClauseTemplate along with its clauses, clause points,
   * clause point subs, clause point sub children, clause headers, and
   * clause footers in a single transaction.
   *
   * Hierarchy:
   *   ClauseTemplate → Clause → ClausePoint → ClausePointSub → ClausePointSubChild
   *   ClauseTemplate → ClauseHeader (flat, no children)
   *   ClauseTemplate → ClauseFooter (flat, no children)
   */
  async upsertTemplateWithClauses(templateData = {}, isDoubleDatabase = true) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      const {
        id_clause_template,
        clause_list = [],
        clauses_header = [],
        clauses_footer = [],
        ...templateFields
      } = templateData;

      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(
          `🔄 Processing ClauseTemplate ${
            id_clause_template ? `ID ${id_clause_template}` : "(new)"
          } with ${clause_list.length} clauses, ${
            clauses_header.length
          } headers and ${clauses_footer.length} footers in both databases...`
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

        for (const item of clause_list) {
          const { id, clause_points = [], ...clauseData } = item;
          const { createdAt, updatedAt, ...cleanClauseData } = clauseData;

          const clausePayload = {
            ...cleanClauseData,
            id_clause_template: templateId,
          };

          let clauseId;
          let clause1;
          let isClauseUpdate = false;

          if (id) {
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

            // ── Step 4: Sync ClausePointSub (+ nested ClausePointSubChild) ────
            const incomingSubIds = clause_point_sub
              .filter((s) => s.id)
              .map((s) => s.id);

            const existingSubs = await models.db1.ClausePointSub.findAll({
              where: { id_clause_point: resolvedPointId },
              attributes: ["id"],
              transaction: transaction1,
            });
            const existingSubIds = existingSubs.map((s) => s.id);

            const subIdsToDelete = existingSubIds.filter(
              (existId) => !incomingSubIds.includes(existId)
            );

            if (subIdsToDelete.length > 0) {
              console.log(
                `🗑️ Deleting ${
                  subIdsToDelete.length
                } removed clause_point_sub(s): [${subIdsToDelete.join(", ")}]`
              );

              await models.db1.ClausePointSub.destroy({
                where: { id: subIdsToDelete },
                transaction: transaction1,
              });
              await models.db2.ClausePointSub.destroy({
                where: { id: subIdsToDelete },
                transaction: transaction2,
              });
            }

            const clausePointSubResults = [];

            for (const subItem of clause_point_sub) {
              const {
                id: subId,
                clause_point_sub_child = [],
                ...subData
              } = subItem;

              const {
                createdAt: _sca,
                updatedAt: _sua,
                id_clause_point: _sic,
                ...cleanSubData
              } = subData;

              const subPayload = {
                ...cleanSubData,
                id_clause_point: resolvedPointId,
              };

              let resolvedSubId;
              let sub1;
              let isSubUpdate = false;

              if (subId) {
                isSubUpdate = true;
                resolvedSubId = subId;

                await models.db1.ClausePointSub.update(subPayload, {
                  where: { id: resolvedSubId },
                  transaction: transaction1,
                });
                await models.db2.ClausePointSub.update(subPayload, {
                  where: { id: resolvedSubId },
                  transaction: transaction2,
                });

                sub1 = await models.db1.ClausePointSub.findByPk(resolvedSubId, {
                  transaction: transaction1,
                });
              } else {
                sub1 = await models.db1.ClausePointSub.create(subPayload, {
                  transaction: transaction1,
                });
                resolvedSubId = sub1.id;

                await models.db2.ClausePointSub.create(
                  { ...subPayload, id: resolvedSubId },
                  { transaction: transaction2 }
                );
              }

              // ── Step 5: Sync ClausePointSubChild under this sub ───────────
              const subChildData = clause_point_sub_child.map((child) => {
                const {
                  createdAt: _cca,
                  updatedAt: _cua,
                  id_clause_point_sub: _cic,
                  ...cleanChild
                } = child;
                return { ...cleanChild, id_clause_point_sub: resolvedSubId };
              });

              const subChildResult = await syncChildRecords({
                Model1: models.db1.ClausePointSubChild,
                Model2: models.db2.ClausePointSubChild,
                foreignKey: "id_clause_point_sub",
                parentId: resolvedSubId,
                newData: subChildData,
                transaction1,
                transaction2,
                isDoubleDatabase,
              });

              clausePointSubResults.push({
                clause_point_sub: sub1.toJSON(),
                clause_point_sub_child: subChildResult,
                operation: isSubUpdate ? "updated" : "created",
              });
            }

            clausePointResults.push({
              clause_point: point1.toJSON(),
              clause_point_sub: clausePointSubResults,
              operation: isPointUpdate ? "updated" : "created",
            });
          }

          clauseResults.push({
            clause: clause1.toJSON(),
            clause_points: clausePointResults,
            operation: isClauseUpdate ? "updated" : "created",
          });
        }

        // ── Step 6: Sync ClauseHeaders under this template ────────────────────
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

        // ── Step 7: Sync ClauseFooters under this template ────────────────────
        const clauseFooterData = clauses_footer.map((footer) => {
          const {
            createdAt: _fca,
            updatedAt: _fua,
            id_clause_template: _fit,
            ...cleanFooter
          } = footer;
          return { ...cleanFooter, id_clause_template: templateId };
        });

        const clauseFooterResult = await syncChildRecords({
          Model1: models.db1.ClauseFooter,
          Model2: models.db2.ClauseFooter,
          foreignKey: "id_clause_template",
          parentId: templateId,
          newData: clauseFooterData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        // Commit both transactions
        await transaction1.commit();
        await transaction2.commit();

        console.log(
          `✅ ClauseTemplate ID ${templateId} with clauses, headers and footers successfully processed`
        );

        return {
          template: template1.toJSON(),
          clause_list: clauseResults,
          clauses_header: clauseHeaderResult,
          clauses_footer: clauseFooterResult,
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

          // Sync ClausePoints for this clause
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

            // Sync ClausePointSub (+ nested ClausePointSubChild) — DB1 only
            const incomingSubIds = clause_point_sub
              .filter((s) => s.id)
              .map((s) => s.id);

            const existingSubs = await models.db1.ClausePointSub.findAll({
              where: { id_clause_point: resolvedPointId },
              attributes: ["id"],
              transaction: transaction1,
            });
            const existingSubIds = existingSubs.map((s) => s.id);

            const subIdsToDelete = existingSubIds.filter(
              (existId) => !incomingSubIds.includes(existId)
            );

            if (subIdsToDelete.length > 0) {
              await models.db1.ClausePointSub.destroy({
                where: { id: subIdsToDelete },
                transaction: transaction1,
              });
            }

            const clausePointSubResults = [];

            for (const subItem of clause_point_sub) {
              const {
                id: subId,
                clause_point_sub_child = [],
                ...subData
              } = subItem;

              const {
                createdAt: _sca,
                updatedAt: _sua,
                id_clause_point: _sic,
                ...cleanSubData
              } = subData;

              const subPayload = {
                ...cleanSubData,
                id_clause_point: resolvedPointId,
              };

              let resolvedSubId;
              let sub;
              let isSubUpdate = false;

              if (subId) {
                isSubUpdate = true;
                resolvedSubId = subId;

                await models.db1.ClausePointSub.update(subPayload, {
                  where: { id: resolvedSubId },
                  transaction: transaction1,
                });

                sub = await models.db1.ClausePointSub.findByPk(resolvedSubId, {
                  transaction: transaction1,
                });
              } else {
                sub = await models.db1.ClausePointSub.create(subPayload, {
                  transaction: transaction1,
                });
                resolvedSubId = sub.id;
              }

              const subChildData = clause_point_sub_child.map((child) => {
                const {
                  createdAt: _cca,
                  updatedAt: _cua,
                  id_clause_point_sub: _cic,
                  ...cleanChild
                } = child;
                return { ...cleanChild, id_clause_point_sub: resolvedSubId };
              });

              const subChildResult = await syncChildRecords({
                Model1: models.db1.ClausePointSubChild,
                Model2: null,
                foreignKey: "id_clause_point_sub",
                parentId: resolvedSubId,
                newData: subChildData,
                transaction1,
                transaction2: null,
                isDoubleDatabase: false,
              });

              clausePointSubResults.push({
                clause_point_sub: sub.toJSON(),
                clause_point_sub_child: subChildResult,
                operation: isSubUpdate ? "updated" : "created",
              });
            }

            clausePointResults.push({
              clause_point: point.toJSON(),
              clause_point_sub: clausePointSubResults,
              operation: isPointUpdate ? "updated" : "created",
            });
          }

          clauseResults.push({
            clause: clause.toJSON(),
            clause_points: clausePointResults,
            operation: isClauseUpdate ? "updated" : "created",
          });
        }

        // Sync ClauseHeaders (DB1 only)
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

        // Sync ClauseFooters (DB1 only)
        const clauseFooterData = clauses_footer.map((footer) => {
          const {
            createdAt: _fca,
            updatedAt: _fua,
            id_clause_template: _fit,
            ...cleanFooter
          } = footer;
          return { ...cleanFooter, id_clause_template: templateId };
        });

        const clauseFooterResult = await syncChildRecords({
          Model1: models.db1.ClauseFooter,
          Model2: null,
          foreignKey: "id_clause_template",
          parentId: templateId,
          newData: clauseFooterData,
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
          clauses_footer: clauseFooterResult,
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
          { where: { id }, transaction: transaction1 }
        );
        const deleted2 = await this.Model2.update(
          { is_active: false },
          { where: { id }, transaction: transaction2 }
        );

        if (deleted1 === 0 && deleted2 === 0) {
          throw new Error(`ClauseTemplate with ID ${id} not found`);
        }

        await transaction1.commit();
        await transaction2.commit();

        console.log(`✅ ClauseTemplate ID ${id} deleted from both databases`);

        return {
          deleted: true,
          message: `ClauseTemplate ID ${id} and all related clauses, clause points, clause point subs, clause point sub children, clause headers and clause footers deleted successfully`,
        };
      } else {
        transaction1 = await db1.transaction();

        const deleted = await this.Model1.update(
          { is_active: false },
          { where: { id }, transaction: transaction1 }
        );

        if (deleted === 0) {
          throw new Error(`ClauseTemplate with ID ${id} not found`);
        }

        await transaction1.commit();

        console.log(`✅ ClauseTemplate ID ${id} deleted from DB1`);

        return {
          deleted: true,
          message: `ClauseTemplate ID ${id} and all related clauses, clause points, clause point subs, clause point sub children, clause headers and clause footers deleted successfully`,
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
