const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const approvalAccess = require("../src/services/approvalFlow/approvalAccess.service");
const APPROVAL_TARGETS = require("../src/services/approvalFlow/approvalTargets");
const { models } = require("../src/models");

const paymentTarget = APPROVAL_TARGETS["payment request"];
const actor = { id: 7, id_position: 3, id_department: 10, id_division: 20 };

function mockAccess(t, { doc, flows = [], user = actor, enforce = false }) {
  const originals = {
    user: models.db1.User.findByPk,
    flows: models.db1.ApprovalFlow.findAll,
    doc: models.db1.PaymentRequest.findByPk,
    env: process.env.APPROVAL_ENFORCE,
    warn: console.warn,
  };
  t.after(() => {
    models.db1.User.findByPk = originals.user;
    models.db1.ApprovalFlow.findAll = originals.flows;
    models.db1.PaymentRequest.findByPk = originals.doc;
    console.warn = originals.warn;
    if (originals.env === undefined) delete process.env.APPROVAL_ENFORCE;
    else process.env.APPROVAL_ENFORCE = originals.env;
  });
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  process.env.APPROVAL_ENFORCE = enforce ? "true" : "false";
  models.db1.User.findByPk = async () => (user ? { toJSON: () => user } : null);
  models.db1.ApprovalFlow.findAll = async () => flows;
  models.db1.PaymentRequest.findByPk = async () => doc;
  return warnings;
}

test("approver scope limits documents to the actor's department", () => {
  const flows = [{ approval_for: "payment request", status: "pending", scope: "department" }];
  assert.equal(approvalAccess.canAct(paymentTarget, { status: "pending", id_department_request: 10 }, actor, flows), true);
  assert.equal(approvalAccess.canAct(paymentTarget, { status: "pending", id_department_request: 11 }, actor, flows), false);
  assert.equal(approvalAccess.canAct(paymentTarget, { status: "approve fat", id_department_request: 10 }, actor, flows), false);
  assert.equal(approvalAccess.canAct(paymentTarget, { status: "pending", id_department_request: 10 },
    { ...actor, id_department: null }, flows), false);
});

test("a scope the feature does not support falls back to all", () => {
  const flows = [{ approval_for: "invoice", status: "on verification", scope: "department" }];
  assert.equal(approvalAccess.canAct(APPROVAL_TARGETS.invoice, { status: "on verification" }, actor, flows), true);
  assert.deepEqual(approvalAccess.scopeWhere(APPROVAL_TARGETS.invoice, "division", actor), {});
});

test("authorize only logs while enforcement is off", async (t) => {
  const warnings = mockAccess(t, { doc: { id: 1, status: "pending", id_department_request: 10 } });
  await approvalAccess.authorize("payment request", 1, 7);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /not enforced/);
});

test("authorize rejects non-approvers and wrong statuses when enforced", async (t) => {
  mockAccess(t, { doc: { id: 1, status: "pending", id_department_request: 10 }, enforce: true });
  await assert.rejects(approvalAccess.authorize("payment request", 1, 7),
    (error) => error.statusCode === 403);
  await assert.rejects(approvalAccess.authorize("payment request", 1, 7, ["approve fat"]),
    (error) => error.statusCode === 409);
});

test("authorize passes approvers and leaves missing documents to the controller", async (t) => {
  const flows = [{ approval_for: "payment request", status: "pending", scope: "all" }];
  const warnings = mockAccess(t, { doc: { id: 1, status: "pending" }, flows, enforce: true });
  await approvalAccess.authorize("payment request", 1, 7);
  models.db1.PaymentRequest.findByPk = async () => null;
  await approvalAccess.authorize("payment request", 99, 7);
  assert.equal(warnings.length, 0);
});

test("my task filter combines status and scope per flow", () => {
  const flows = [
    { approval_for: "payment request", status: "pending", scope: "department" },
    { approval_for: "payment request", status: "approve fat", scope: "all" },
  ];
  const where = approvalAccess.taskWhere(paymentTarget, flows, actor);
  assert.equal(where.is_active, true);
  assert.deepEqual(where[Op.or], [
    { status: "pending", id_department_request: 10 },
    { status: "approve fat" },
  ]);
  assert.equal(approvalAccess.taskWhere(paymentTarget, [flows[0]], { ...actor, id_department: null }), null);
});

test("my task overview lists every task across features, newest first", async (t) => {
  mockAccess(t, { flows: [
    { approval_for: "quotation", status: "pending", scope: "all", label: "Approve Quotation" },
    { approval_for: "invoice", status: "approved", scope: "all", label: "Signing Invoice" },
  ] });
  const originals = { quotation: models.db1.Quotation.findAll, invoice: models.db1.Invoice.findAll };
  t.after(() => {
    models.db1.Quotation.findAll = originals.quotation;
    models.db1.Invoice.findAll = originals.invoice;
  });
  let quotationWhere;
  models.db1.Quotation.findAll = async ({ where }) => {
    quotationWhere = where;
    return [{ id: 1, status: "pending", quotation_no: "Q-1", createdAt: "2026-10-01" }];
  };
  models.db1.Invoice.findAll = async () => [
    { id: 5, status: "approved", invoice_no: "INV-5", createdAt: "2026-10-05" },
  ];
  const result = await approvalAccess.getMyTasks(7);
  assert.equal(result.total, 2);
  assert.equal(result.summary.find((item) => item.approval_for === "quotation").total, 1);
  assert.equal(result.summary.find((item) => item.approval_for === "contract").total, 0);
  assert.deepEqual(result.tasks.map((task) => [task.approval_for, task.document_no, task.action_label]),
    [["invoice", "INV-5", "Signing Invoice"], ["quotation", "Q-1", "Approve Quotation"]]);
  assert.equal(result.tasks[0].approval_for_label, "Invoice");
  assert.equal(quotationWhere.is_history, false);
});

test("GET responses get action flags for arrays, pages and single documents", async (t) => {
  const flows = [{ approval_for: "payment request", status: "pending", scope: "department", label: "Approve DM" }];
  mockAccess(t, { flows });
  const findAll = models.db1.ApprovalFlow.findAll;
  models.db1.ApprovalFlow.findAll = async ({ attributes }) =>
    attributes ? [...flows, { status: "approve cashier", label: "Input Payment" }] : findAll();
  const rows = [
    { id: 1, status: "pending", id_department_request: 10 },
    { id: 2, status: "pending", id_department_request: 11 },
    { id: 3, status: "approve cashier", id_department_request: 10 },
    { id: 4, status: "paid", id_department_request: 10 },
  ];
  const flagged = await approvalAccess.attachActionFlags("payment request", rows, 7);
  assert.deepEqual(flagged.map((row) => [row.is_can_approve_reject, row.action_label]),
    [[true, "Approve DM"], [false, "Approve DM"], [false, "Input Payment"], [false, null]]);
  const page = await approvalAccess.attachActionFlags("payment request", { data: [rows[0]], pagination: {} }, 7);
  assert.equal(page.data[0].is_can_approve_reject, true);
  assert.ok(page.pagination);
  assert.equal((await approvalAccess.attachActionFlags("payment request", rows[0], 7)).is_can_approve_reject, true);
  assert.equal(await approvalAccess.attachActionFlags("payment request", null, 7), null);
});

test("action flags fall back to false when approval data cannot be loaded", async (t) => {
  mockAccess(t, {});
  const errors = console.error;
  t.after(() => { console.error = errors; });
  console.error = () => {};
  models.db1.ApprovalFlow.findAll = async () => { throw new Error("Unknown column 'scope'"); };
  const [row] = await approvalAccess.attachActionFlags("invoice", [{ id: 1, status: "on verification" }], 7);
  assert.equal(row.is_can_approve_reject, false);
  assert.equal(row.action_label, "Approve / Reject Invoice");
});
