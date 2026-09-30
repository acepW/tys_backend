const {
  models,
  fail,
  withTransactions,
  mirrorCreate,
  mirrorUpdate,
  mirrorDestroy,
  syncFiles,
  deactivateFiles,
  documentNumbers,
} = require("../procurement/shared");

const itemFields = [
  "item_name",
  "specification",
  "quantity_unit",
  "quantity",
  "procurement_type",
  "average_usage",
  "remarks",
  "product_link",
];

function itemPayload(item, parent, userId) {
  const data = {
    id_purchase_request: parent.id,
    purchase_request_category: parent.purchase_request_category,
  };
  for (const field of itemFields)
    if (item[field] !== undefined) data[field] = item[field];
  data.id_requester = userId;
  return data;
}

class PurchaseRequestService {
  async getNo(isDoubleDatabase = true) {
    return (
      await documentNumbers("PurchaseRequest", "PUR", isDoubleDatabase)
    ).map((row) => ({
      ...row,
      no_purchase_request: row.document_no,
    }));
  }

  includes() {
    const db = models.db1;
    return [
      {
        model: db.User,
        as: "user_request",
        attributes: ["id", "name", "email"],
      },
      {
        model: db.Company,
        as: "company",
        attributes: ["id", "company_name", "initial_company"],
      },
      { model: db.Department, as: "department" },
      { model: db.Division, as: "division" },
      {
        model: db.PurchaseRequestItem,
        as: "items",
        separate: true,
        order: [["id", "ASC"]],
        include: [
          {
            model: db.User,
            as: "requester",
            attributes: ["id", "name", "email"],
          },
          {
            model: db.File,
            as: "files_product",
            required: false,
            where: { is_active: true },
          },
        ],
      },
      {
        model: db.PurchaseRequestVerificationProgress,
        as: "verification_progress",
        separate: true,
        order: [["createdAt", "ASC"]],
        include: [{ model: db.User, as: "user", attributes: ["id", "name"] }],
      },
    ];
  }

  async getById(id) {
    const row = await models.db1.PurchaseRequest.findByPk(id, {
      include: this.includes(),
    });
    return row?.toJSON() || null;
  }

  async getAll(where = {}, page, limit) {
    const options = {
      where,
      include: this.includes(),
      order: [["createdAt", "DESC"]],
      distinct: true,
    };
    if (page && limit) {
      options.limit = limit;
      options.offset = (page - 1) * limit;
      const { count, rows } =
        await models.db1.PurchaseRequest.findAndCountAll(options);
      return {
        data: rows.map((row) => row.toJSON()),
        pagination: {
          total_data: count,
          total_page: Math.ceil(count / limit),
          current_page: page,
          per_page: limit,
        },
      };
    }
    return (await models.db1.PurchaseRequest.findAll(options)).map((row) =>
      row.toJSON(),
    );
  }

  async syncItems(parent, items, userId, t1, t2) {
    const existing = await models.db1.PurchaseRequestItem.findAll({
      where: { id_purchase_request: parent.id },
      transaction: t1,
    });
    const existingIds = new Set(existing.map((row) => row.id));
    const kept = new Set();
    for (const item of items) {
      const data = itemPayload(item, parent, userId);
      let id;
      if (item.id != null) {
        id = Number(item.id);
        if (!existingIds.has(id) || kept.has(id))
          fail(`Invalid or duplicate purchase request item id ${item.id}`);
        kept.add(id);
        await mirrorUpdate("PurchaseRequestItem", id, data, t1, t2);
      } else {
        id = (await mirrorCreate("PurchaseRequestItem", data, t1, t2)).id;
      }
      await syncFiles(
        "purchase_request_items",
        id,
        "files_product",
        item.files_product,
        userId,
        t1,
        t2,
      );
    }
    for (const row of existing) {
      if (kept.has(row.id)) continue;
      await deactivateFiles("purchase_request_items", row.id, t1, t2);
      await mirrorDestroy("PurchaseRequestItem", row.id, t1, t2);
    }
  }

  async create(data, items, userId, isDoubleDatabase = true) {
    const id = await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const parent = await mirrorCreate(
        "PurchaseRequest",
        {
          ...data,
          id_user_request: userId,
          status: "pending",
          request_date: data.request_date || new Date(),
        },
        t1,
        t2,
      );
      await this.syncItems(parent, items, userId, t1, t2);
      await mirrorCreate(
        "PurchaseRequestVerificationProgress",
        {
          id_purchase_request: parent.id,
          id_user: userId,
          status: "pending",
          note: "Purchase request created",
        },
        t1,
        t2,
      );
      return parent.id;
    });
    return this.getById(id);
  }

  async update(id, data, items, userId, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const parent = await models.db1.PurchaseRequest.findByPk(id, {
        transaction: t1,
        lock: t1.LOCK.UPDATE,
      });
      if (!parent) fail("Purchase request not found", 404);
      if (parent.status !== "pending")
        fail("Only pending purchase requests can be edited", 409);
      if (parent.id_user_request !== userId)
        fail("Only the creator can edit this purchase request", 403);
      await mirrorUpdate("PurchaseRequest", id, data, t1, t2);
      const updated = { ...parent.toJSON(), ...data };
      if (items !== undefined)
        await this.syncItems(updated, items, userId, t1, t2);
      else if (data.purchase_request_category !== undefined) {
        const currentItems = await models.db1.PurchaseRequestItem.findAll({
          where: { id_purchase_request: id },
          transaction: t1,
        });
        for (const item of currentItems) {
          await mirrorUpdate(
            "PurchaseRequestItem",
            item.id,
            { purchase_request_category: data.purchase_request_category },
            t1,
            t2,
          );
        }
      }
      await mirrorCreate(
        "PurchaseRequestVerificationProgress",
        {
          id_purchase_request: id,
          id_user: userId,
          status: "pending",
          note: "Purchase request edited",
        },
        t1,
        t2,
      );
    });
    return this.getById(id);
  }

  async action(id, action, userId, note, decisions, isDoubleDatabase = true) {
    const transitions = {
      request_manager: ["pending", "request manager"],
      approve_manager: ["request manager", "request ga"],
      reject_manager: ["request manager", "rejected manager"],
      approve_ga: ["request ga", "approved ga"],
      reject_ga: ["request ga", "rejected ga"],
    };
    const transition = transitions[action];
    if (!transition) fail("Invalid action");
    if (action.startsWith("reject") && !note?.trim())
      fail("note is required for rejection");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const parent = await models.db1.PurchaseRequest.findByPk(id, {
        transaction: t1,
        lock: t1.LOCK.UPDATE,
      });
      if (!parent) fail("Purchase request not found", 404);
      if (parent.status !== transition[0])
        fail(`Action ${action} is not allowed from ${parent.status}`, 409);
      if (action === "request_manager" && parent.id_user_request !== userId)
        fail("Only the creator can submit this purchase request", 403);
      const items = await models.db1.PurchaseRequestItem.findAll({
        where: { id_purchase_request: id },
        transaction: t1,
      });
      if (action === "request_manager" && !items.length)
        fail("At least one item is required");
      if (action === "approve_ga") {
        if (!Array.isArray(decisions) || decisions.length !== items.length)
          fail("item_decisions must cover every item");
        const validIds = new Set(items.map((item) => item.id));
        const seen = new Set();
        let approved = 0;
        for (const decision of decisions) {
          const itemId = Number(decision.id_purchase_request_item);
          if (
            !validIds.has(itemId) ||
            seen.has(itemId) ||
            !["approved", "rejected"].includes(decision.decision)
          ) {
            fail("item_decisions contains an invalid item or decision");
          }
          seen.add(itemId);
          if (decision.decision === "approved") approved++;
          await mirrorUpdate(
            "PurchaseRequestItem",
            itemId,
            { ga_decision: decision.decision },
            t1,
            t2,
          );
        }
        if (!approved)
          fail(
            "At least one item must be approved; use reject_ga to reject the whole request",
          );
      }
      if (action === "reject_ga") {
        for (const item of items)
          await mirrorUpdate(
            "PurchaseRequestItem",
            item.id,
            { ga_decision: "rejected" },
            t1,
            t2,
          );
      }
      await mirrorUpdate(
        "PurchaseRequest",
        id,
        { status: transition[1] },
        t1,
        t2,
      );
      await mirrorCreate(
        "PurchaseRequestVerificationProgress",
        {
          id_purchase_request: id,
          id_user: userId,
          status: transition[1],
          note: note || null,
        },
        t1,
        t2,
      );
    });
    return this.getById(id);
  }

  async getToProcessGaOrder(idCompany) {
    const db = models.db1;
    const parentWhere = { status: "approved ga" };
    if (idCompany) parentWhere.id_company = idCompany;
    return (
      await db.PurchaseRequestItem.findAll({
        where: { ga_decision: "approved", id_ga_purchase_order: null },
        include: [
          {
            model: db.PurchaseRequest,
            as: "purchase_request",
            required: true,
            where: parentWhere,
          },
          {
            model: db.User,
            as: "requester",
            attributes: ["id", "name", "email"],
          },
          {
            model: db.File,
            as: "files_product",
            required: false,
            where: { is_active: true },
          },
        ],
        order: [["createdAt", "ASC"]],
      })
    ).map((row) => row.toJSON());
  }
}

module.exports = new PurchaseRequestService();
