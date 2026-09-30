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

const taxFlags = ["tax_ppn", "tax_pph_23", "tax_pp_20", "tax_pph_4_ayat_2"];
const taxAmounts = ["ppn", "pph", "pp_20", "pph_4_ayat_2"];

function buildItem(source, input, orderId) {
  const quantity = Number(source.quantity);
  const unitPrice = Number(input.estimated_unit_price ?? 0);
  const estimatedTotal = Number(
    input.estimated_total_price ?? quantity * unitPrice,
  );
  const subTotal = Number(input.sub_total ?? estimatedTotal);
  const tax = Object.fromEntries(
    taxFlags.map((key) => [key, input[key] ?? false]),
  );
  const amounts = Object.fromEntries(
    taxAmounts.map((key) => [key, Number(input[key] ?? 0)]),
  );
  const total = Number(
    input.total ??
      subTotal +
        amounts.ppn -
        amounts.pph -
        amounts.pp_20 -
        amounts.pph_4_ayat_2,
  );
  for (const [key, value] of Object.entries({
    estimated_unit_price: unitPrice,
    estimated_total_price: estimatedTotal,
    sub_total: subTotal,
    ...amounts,
    total,
  })) {
    if (!Number.isFinite(value) || value < 0)
      fail(`${key} must be a non-negative number`);
  }
  for (const key of taxFlags)
    if (typeof tax[key] !== "boolean") fail(`${key} must be a boolean`);
  return {
    id_ga_purchase_order: orderId,
    id_purchase_request: source.id_purchase_request,
    id_purchase_request_item: source.id,
    id_vendor: input.id_vendor ?? null,
    item_name: source.item_name,
    specification: source.specification,
    purchase_request_category: source.purchase_request_category,
    quantity_unit: source.quantity_unit,
    quantity: source.quantity,
    id_requester: source.id_requester,
    procurement_type: source.procurement_type,
    average_usage: source.average_usage,
    remarks: input.remarks ?? source.remarks,
    product_link: source.product_link,
    estimated_unit_price: unitPrice,
    estimated_total_price: estimatedTotal,
    sub_total: subTotal,
    ...tax,
    ...amounts,
    total,
  };
}

class GaPurchaseOrderService {
  async getNo(isDoubleDatabase = true) {
    return (
      await documentNumbers("GaPurchaseOrder", "GAPO", isDoubleDatabase)
    ).map((row) => ({
      ...row,
      no_ga_purchase_order: row.document_no,
    }));
  }

  includes() {
    const db = models.db1;
    return [
      {
        model: db.Company,
        as: "company",
        attributes: ["id", "company_name", "initial_company"],
      },
      {
        model: db.User,
        as: "user_request",
        attributes: ["id", "name", "email"],
      },
      {
        model: db.File,
        as: "file_attachment",
        required: false,
        where: { is_active: true },
      },
      {
        model: db.GaPurchaseOrderItem,
        as: "items",
        separate: true,
        order: [["id", "ASC"]],
        include: [
          {
            model: db.PurchaseRequest,
            as: "purchase_request",
            attributes: ["id", "purchase_request_no"],
          },
          { model: db.Vendor, as: "vendor", attributes: ["id", "vendor_name"] },
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
          {
            model: db.File,
            as: "files_attachment",
            required: false,
            where: { is_active: true },
          },
        ],
      },
      {
        model: db.GaPurchaseOrderVerificationProgress,
        as: "verification_progress",
        separate: true,
        order: [["createdAt", "ASC"]],
        include: [{ model: db.User, as: "user", attributes: ["id", "name"] }],
      },
    ];
  }

  async getById(id) {
    const row = await models.db1.GaPurchaseOrder.findByPk(id, {
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
        await models.db1.GaPurchaseOrder.findAndCountAll(options);
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
    return (await models.db1.GaPurchaseOrder.findAll(options)).map((row) =>
      row.toJSON(),
    );
  }

  async sourceItem(id, companyId, orderId, t1) {
    const item = await models.db1.PurchaseRequestItem.findByPk(id, {
      transaction: t1,
      lock: t1.LOCK.UPDATE,
      include: [
        {
          model: models.db1.PurchaseRequest,
          as: "purchase_request",
          required: true,
        },
      ],
    });
    if (!item) fail(`Purchase request item ${id} not found`, 404);
    if (
      item.purchase_request.status !== "approved ga" ||
      item.ga_decision !== "approved"
    ) {
      fail(`Purchase request item ${id} has not been approved by GA`, 409);
    }
    if (
      companyId != null &&
      Number(item.purchase_request.id_company) !== Number(companyId)
    ) {
      fail("All order items must belong to one company");
    }
    if (
      item.id_ga_purchase_order != null &&
      Number(item.id_ga_purchase_order) !== Number(orderId)
    ) {
      fail(`Purchase request item ${id} has already been ordered`, 409);
    }
    return item;
  }

  async syncItems(orderId, companyId, items, userId, t1, t2) {
    const existing = await models.db1.GaPurchaseOrderItem.findAll({
      where: { id_ga_purchase_order: orderId },
      transaction: t1,
    });
    const existingBySource = new Map(
      existing.map((item) => [item.id_purchase_request_item, item]),
    );
    const seen = new Set();
    for (const input of items) {
      const sourceId = Number(input.id_purchase_request_item);
      if (!Number.isInteger(sourceId) || seen.has(sourceId))
        fail("Order item source IDs must be unique positive integers");
      seen.add(sourceId);
      const source = await this.sourceItem(sourceId, companyId, orderId, t1);
      if (
        input.id_purchase_request != null &&
        Number(input.id_purchase_request) !== Number(source.id_purchase_request)
      ) {
        fail(`id_purchase_request does not match item ${sourceId}`);
      }
      const data = buildItem(source, input, orderId);
      const old = existingBySource.get(sourceId);
      let itemId;
      if (old) {
        itemId = old.id;
        await mirrorUpdate("GaPurchaseOrderItem", itemId, data, t1, t2);
      } else {
        // Conditional claim prevents a concurrent order from selecting the same source item.
        const [claimed] = await models.db1.PurchaseRequestItem.update(
          { id_ga_purchase_order: orderId },
          {
            where: {
              id: sourceId,
              id_ga_purchase_order: null,
              ga_decision: "approved",
            },
            transaction: t1,
          },
        );
        if (!claimed)
          fail(
            `Purchase request item ${sourceId} has already been ordered`,
            409,
          );
        if (t2) {
          const [claimed2] = await models.db2.PurchaseRequestItem.update(
            { id_ga_purchase_order: orderId },
            {
              where: {
                id: sourceId,
                id_ga_purchase_order: null,
                ga_decision: "approved",
              },
              transaction: t2,
            },
          );
          if (!claimed2)
            fail(
              `Purchase request item ${sourceId} missing or already ordered in second database`,
              409,
            );
        }
        itemId = (await mirrorCreate("GaPurchaseOrderItem", data, t1, t2)).id;
      }
      let productFiles = input.files_product;
      if (!old && productFiles === undefined) {
        const sourceFiles = await models.db1.File.findAll({
          where: {
            fileable_type: "purchase_request_items",
            fileable_id: sourceId,
            category: "files_product",
            is_active: true,
          },
          transaction: t1,
        });
        productFiles = sourceFiles.map((file) => {
          const {
            id,
            fileable_type,
            fileable_id,
            category,
            createdAt,
            updatedAt,
            ...metadata
          } = file.toJSON();
          return metadata;
        });
      }
      await syncFiles(
        "ga_purchase_order_items",
        itemId,
        "files_product",
        productFiles,
        userId,
        t1,
        t2,
      );
      await syncFiles(
        "ga_purchase_order_items",
        itemId,
        "files_attachment",
        input.files_attachment,
        userId,
        t1,
        t2,
      );
    }
    for (const old of existing) {
      if (seen.has(old.id_purchase_request_item)) continue;
      await deactivateFiles("ga_purchase_order_items", old.id, t1, t2);
      await mirrorDestroy("GaPurchaseOrderItem", old.id, t1, t2);
      await mirrorUpdate(
        "PurchaseRequestItem",
        old.id_purchase_request_item,
        { id_ga_purchase_order: null },
        t1,
        t2,
      );
    }
  }

  async create(data, items, userId, isDoubleDatabase = true) {
    const id = await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const first = await this.sourceItem(
        Number(items[0].id_purchase_request_item),
        data.id_company,
        null,
        t1,
      );
      const companyId = first.purchase_request.id_company;
      if (
        data.id_company != null &&
        Number(data.id_company) !== Number(companyId)
      )
        fail("id_company does not match source items");
      const order = await mirrorCreate(
        "GaPurchaseOrder",
        {
          ga_purchase_order_no: data.ga_purchase_order_no,
          id_company: companyId,
          id_user_request: userId,
          request_date: data.request_date || new Date(),
          planned_purchase_date: data.planned_purchase_date || null,
          remarks: data.remarks || null,
          status: "request ga manager",
        },
        t1,
        t2,
      );
      await this.syncItems(order.id, companyId, items, userId, t1, t2);
      await syncFiles(
        "ga_purchase_orders",
        order.id,
        "file_attachment",
        data.file_attachment,
        userId,
        t1,
        t2,
      );
      await mirrorCreate(
        "GaPurchaseOrderVerificationProgress",
        {
          id_ga_purchase_order: order.id,
          id_user: userId,
          status: "request ga manager",
          note: "GA purchase order created",
        },
        t1,
        t2,
      );
      return order.id;
    });
    return this.getById(id);
  }

  async update(id, data, items, userId, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const order = await models.db1.GaPurchaseOrder.findByPk(id, {
        transaction: t1,
        lock: t1.LOCK.UPDATE,
      });
      if (!order) fail("GA purchase order not found", 404);
      if (order.status !== "request ga manager")
        fail("Only orders awaiting GA manager can be edited", 409);
      if (order.id_user_request !== userId)
        fail("Only the creator can edit this order", 403);
      const updateData = {};
      for (const key of ["planned_purchase_date", "remarks"])
        if (data[key] !== undefined) updateData[key] = data[key];
      await mirrorUpdate("GaPurchaseOrder", id, updateData, t1, t2);
      if (items !== undefined)
        await this.syncItems(id, order.id_company, items, userId, t1, t2);
      await syncFiles(
        "ga_purchase_orders",
        id,
        "file_attachment",
        data.file_attachment,
        userId,
        t1,
        t2,
      );
      await mirrorCreate(
        "GaPurchaseOrderVerificationProgress",
        {
          id_ga_purchase_order: id,
          id_user: userId,
          status: order.status,
          note: "GA purchase order edited",
        },
        t1,
        t2,
      );
    });
    return this.getById(id);
  }

  async action(id, action, userId, note, isDoubleDatabase = true) {
    const transitions = {
      approve_ga_manager: ["request ga manager", "request fat"],
      reject_ga_manager: ["request ga manager", "rejected ga manager"],
      approve_fat: ["request fat", "request director"],
      reject_fat: ["request fat", "rejected fat"],
      approve_director: ["request director", "approved"],
      reject_director: ["request director", "rejected director"],
    };
    const transition = transitions[action];
    if (!transition) fail("Invalid action");
    if (action.startsWith("reject") && !note?.trim())
      fail("note is required for rejection");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const order = await models.db1.GaPurchaseOrder.findByPk(id, {
        transaction: t1,
        lock: t1.LOCK.UPDATE,
      });
      if (!order) fail("GA purchase order not found", 404);
      if (order.status !== transition[0])
        fail(`Action ${action} is not allowed from ${order.status}`, 409);
      await mirrorUpdate(
        "GaPurchaseOrder",
        id,
        { status: transition[1] },
        t1,
        t2,
      );
      await mirrorCreate(
        "GaPurchaseOrderVerificationProgress",
        {
          id_ga_purchase_order: id,
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
}

module.exports = new GaPurchaseOrderService();
