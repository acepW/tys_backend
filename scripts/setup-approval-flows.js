// Adds approval_flows.scope when missing, then creates a flow approvable by the
// given position (default "developer") for every approval status that has none yet.
// Existing flows are left untouched.
// Usage: node scripts/setup-approval-flows.js [position_name]
const { DataTypes, Op } = require("sequelize");
const { models, db1, db2 } = require("../src/models");
const approvalFlowService = require("../src/services/approvalFlow/approvalFlow.service");
const APPROVAL_TARGETS = require("../src/services/approvalFlow/approvalTargets");

const addScopeColumn = async (sequelize, name) => {
  const queryInterface = sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable("approval_flows");
  if (columns.scope) return console.log(`[${name}] approval_flows.scope already exists`);
  await queryInterface.addColumn("approval_flows", "scope", {
    type: DataTypes.ENUM("all", "department", "division"),
    allowNull: false,
    defaultValue: "all",
    after: "rule_type",
  });
  console.log(`[${name}] Added approval_flows.scope`);
};

const run = async () => {
  try {
    await addScopeColumn(db1, "DB1");
    await addScopeColumn(db2, "DB2");

    const positionName = process.argv[2] || "developer";
    const position = await models.db1.Position.findOne({
      where: { position_name: { [Op.like]: positionName }, is_active: true },
    });
    if (!position) throw new Error(`Position "${positionName}" not found`);

    for (const [approvalFor, target] of Object.entries(APPROVAL_TARGETS)) {
      for (const [index, [status, label]] of Object.entries(target.statuses).entries()) {
        const existing = await models.db1.ApprovalFlow.findOne({
          where: { approval_for: approvalFor, status, is_active: true },
        });
        if (existing) {
          console.log(`- ${approvalFor} / ${status}: exists, skipped`);
          continue;
        }
        await approvalFlowService.createWithRelations(
          {
            approval_for: approvalFor,
            status,
            label,
            rule_type: "any",
            scope: "all",
            index: index + 1,
          },
          [{ id_position: position.id, is_active: true }],
        );
        console.log(`+ ${approvalFor} / ${status}: created for ${position.position_name}`);
      }
    }
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
