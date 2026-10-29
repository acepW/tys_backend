const { Op } = require("sequelize");
const { models } = require("../../models");
const APPROVAL_TARGETS = require("./approvalTargets");

// While APPROVAL_ENFORCE is not "true", failed checks are only logged so the
// current flows keep running until approver positions are configured.
const isEnforced = () => process.env.APPROVAL_ENFORCE === "true";

const fail = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const getTarget = (approvalFor) => {
  const target = APPROVAL_TARGETS[approvalFor];
  if (!target) fail(`Unknown approval_for "${approvalFor}"`, 400);
  return target;
};

// Document column holding the status a target's flows are keyed on.
const statusField = (target) => target.statusField || "status";

class ApprovalAccessService {
  // Read from the database, not the JWT, so position changes apply without re-login.
  async getActor(userId) {
    if (!userId) return null;
    const user = await models.db1.User.findByPk(userId, {
      attributes: ["id", "id_position", "id_department", "id_division"],
    });
    return user ? user.toJSON() : null;
  }

  /** Active flows whose approver positions include the given position. */
  async getFlowsForPosition(idPosition, approvalFor = null) {
    if (!idPosition) return [];
    const where = { is_active: true };
    if (approvalFor) where.approval_for = approvalFor;
    const rows = await models.db1.ApprovalFlow.findAll({
      where,
      include: [
        {
          model: models.db1.ApprovalFlowPosition,
          as: "approval_flow_positions",
          required: true,
          attributes: [],
          where: { id_position: idPosition, is_active: true },
        },
      ],
    });
    return rows.map((row) => (row.toJSON ? row.toJSON() : row));
  }

  /**
   * Document filter for one flow's scope. Returns {} for no restriction and
   * null when the actor has no department/division to match.
   */
  scopeWhere(target, scope, actor) {
    const field = target.scopes?.[scope];
    if (!field) return {};
    const value = scope === "department" ? actor?.id_department : actor?.id_division;
    return value ? { [field]: value } : null;
  }

  /** Whether one of the actor's flows covers this document's status and scope. */
  canAct(target, doc, actor, flows) {
    return flows.some((flow) => {
      if (flow.status !== doc[statusField(target)]) return false;
      const where = this.scopeWhere(target, flow.scope, actor);
      return where !== null && Object.entries(where).every(([field, value]) => doc[field] === value);
    });
  }

  /**
   * Check that the user may approve/reject document `id` from its current status.
   * Throws 409 for a status outside `fromStatuses` and 403 for a user who is not an
   * approver; both only log while enforcement is off. A missing document is left to
   * the caller's own 404 handling.
   * actAs checks the approvers of that status instead of the document's own, for an
   * optional action open in several statuses to one role (e.g. sales requesting a
   * tax invoice while AR & AP verifies a payment).
   */
  async authorize(approvalFor, id, userId, fromStatuses = null, actAs = null) {
    const target = getTarget(approvalFor);
    const field = statusField(target);
    const scopeFields = Object.values(target.scopes || {});
    const doc = await models.db1[target.model].findByPk(id, {
      attributes: ["id", field, ...scopeFields],
    });
    if (!doc) return;
    const status = doc[field];
    const allowed = fromStatuses || Object.keys(target.statuses);

    let problem = null;
    if (!allowed.includes(status)) {
      problem = [409, `Action is not allowed from status "${status}"`];
    } else {
      const actor = await this.getActor(userId);
      const flows = await this.getFlowsForPosition(actor?.id_position, approvalFor);
      const plain = doc.toJSON ? doc.toJSON() : { ...doc };
      if (actAs) plain[field] = actAs;
      if (!this.canAct(target, plain, actor, flows))
        problem = [403, `You are not allowed to act on ${target.label} with status "${plain[field]}"`];
    }
    if (!problem) return;
    if (!isEnforced()) {
      console.warn(`[approval] ${approvalFor} #${id} by user ${userId}: ${problem[1]} (not enforced)`);
      return;
    }
    fail(problem[1], problem[0]);
  }

  /** is_can_approve_reject for one document, for detail pages. */
  async canActById(approvalFor, id, userId) {
    const target = getTarget(approvalFor);
    const doc = await models.db1[target.model].findByPk(id, {
      attributes: ["id", statusField(target), ...Object.values(target.scopes || {})],
    });
    if (!doc) fail(`${target.label} not found`, 404);
    const actor = await this.getActor(userId);
    const flows = await this.getFlowsForPosition(actor?.id_position, approvalFor);
    return this.canAct(target, doc.toJSON ? doc.toJSON() : doc, actor, flows);
  }

  /**
   * Add is_can_approve_reject and action_label to documents returned by a GET.
   * Accepts an array, a { data: [...] } page, or a single document.
   * action_label names the action the document's status waits for, whoever may do it.
   * Failures are logged and leave is_can_approve_reject false so the GET still works.
   * fields renames both keys, so a second target on the same document (e.g. its tax
   * invoice) can add its own flag beside the main one.
   */
  async attachActionFlags(
    approvalFor,
    data,
    userId,
    fields = { flag: "is_can_approve_reject", label: "action_label" },
  ) {
    const target = getTarget(approvalFor);
    const field = statusField(target);
    let actor = null;
    let flows = [];
    let labels = {};
    try {
      actor = await this.getActor(userId);
      flows = await this.getFlowsForPosition(actor?.id_position, approvalFor);
      const allFlows = await models.db1.ApprovalFlow.findAll({
        where: { approval_for: approvalFor, is_active: true },
        attributes: ["status", "label"],
      });
      labels = Object.fromEntries(allFlows.map((flow) => [flow.status, flow.label]));
    } catch (error) {
      console.error(`[approval] Failed to load action flags for ${approvalFor}:`, error.message);
    }

    const decorate = (row) => {
      if (!row || typeof row !== "object") return row;
      const plain = row.toJSON ? row.toJSON() : row;
      return {
        ...plain,
        [fields.flag]: this.canAct(target, plain, actor, flows),
        [fields.label]: labels[plain[field]] ?? target.statuses[plain[field]] ?? null,
      };
    };
    if (Array.isArray(data)) return data.map(decorate);
    if (data && Array.isArray(data.data)) return { ...data, data: data.data.map(decorate) };
    return decorate(data);
  }

  /** Document filter for everything the actor can act on in one feature, or null for nothing. */
  taskWhere(target, flows, actor) {
    const conditions = flows
      .map((flow) => {
        const where = this.scopeWhere(target, flow.scope, actor);
        return where && { [statusField(target)]: flow.status, ...where };
      })
      .filter(Boolean);
    if (!conditions.length) return null;
    return { is_active: true, ...(target.baseWhere || {}), [Op.or]: conditions };
  }

  /**
   * Documents waiting for the user's action, with every document column and no relations.
   * Without approvalFor: per-feature counts plus every task across features, newest first.
   * With approvalFor: that feature's tasks, paginated.
   */
  async getMyTasks(userId, { approvalFor = null, page = 1, limit = 10 } = {}) {
    if (approvalFor) getTarget(approvalFor);
    const actor = await this.getActor(userId);
    const flows = await this.getFlowsForPosition(actor?.id_position, approvalFor);
    const flowsFor = (key) => flows.filter((flow) => flow.approval_for === key);
    const toTask = (key, row) => {
      const target = APPROVAL_TARGETS[key];
      const plain = row.toJSON ? row.toJSON() : row;
      const status = plain[statusField(target)];
      const flow = flowsFor(key).find((item) => item.status === status);
      return {
        ...plain,
        approval_for: key,
        approval_for_label: target.label,
        document_no: plain[target.numberField] ?? null,
        action_label: flow?.label ?? target.statuses[status] ?? null,
        is_can_approve_reject: true,
      };
    };

    if (!approvalFor) {
      const summary = [];
      const tasks = [];
      for (const [key, target] of Object.entries(APPROVAL_TARGETS)) {
        const where = this.taskWhere(target, flowsFor(key), actor);
        const rows = where
          ? await models.db1[target.model].findAll({ where, order: [["createdAt", "DESC"]] })
          : [];
        summary.push({ approval_for: key, label: target.label, total: rows.length });
        tasks.push(...rows.map((row) => toTask(key, row)));
      }
      tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return { total: tasks.length, summary, tasks };
    }

    const target = APPROVAL_TARGETS[approvalFor];
    const where = this.taskWhere(target, flowsFor(approvalFor), actor);
    let count = 0;
    let rows = [];
    if (where) {
      ({ count, rows } = await models.db1[target.model].findAndCountAll({
        where,
        order: [["createdAt", "DESC"]],
        limit,
        offset: (page - 1) * limit,
      }));
    }
    return {
      data: rows.map((row) => toTask(approvalFor, row)),
      pagination: {
        total_data: count,
        total_page: Math.ceil(count / limit),
        current_page: page,
        per_page: limit,
      },
    };
  }
}

module.exports = new ApprovalAccessService();
module.exports.APPROVAL_TARGETS = APPROVAL_TARGETS;
