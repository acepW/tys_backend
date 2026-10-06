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
const inventoryService = require("../inventory/inventory.service");

const taxFlags = ["tax_ppn", "tax_pph_23", "tax_pp_20", "tax_pph_4_ayat_2"];
const taxAmounts = ["ppn", "pph", "pp_20", "pph_4_ayat_2"];
const orderFileCategories = [
  "file_attachment",
  "files_payment",
  "files_purchase_proof",
  "files_goods_receipt",
];

// Approval flow: action -> { current status: next status }.
// Statuses prefixed with "return" belong to the goods return cycle, which goes
// through GA manager, AR/AP and cashier, then back to GA staff (request receiving).
const transitions = {
  approve_ga_manager: {
    "request ga manager": "request director",
    "return request ga manager": "return request ar ap",
  },
  reject_ga_manager: {
    "request ga manager": "rejected ga manager",
    "return request ga manager": "request receiving",
  },
  approve_director: { "request director": "request ar ap" },
  reject_director: { "request director": "rejected director" },
  approve_ar_ap: {
    "request ar ap": "request fat",
    "return request ar ap": "return request cashier",
  },
  reject_ar_ap: {
    "request ar ap": "rejected ar ap",
    "return request ar ap": "request receiving",
  },
  approve_fat: { "request fat": "request cashier" },
  reject_fat: { "request fat": "rejected fat" },
  approve_cashier: {
    "request cashier": "request receiving",
    "return request cashier": "request receiving",
  },
  reject_cashier: {
    "request cashier": "rejected cashier",
    "return request cashier": "request receiving",
  },
  return_goods: { "request receiving": "return request ga manager" },
  accept_goods: { "request receiving": "finished" },
};
const noteRequired = (action) =>
  action.startsWith("reject") || action === "return_goods";

async function countFiles(id, category, t1) {
  return models.db1.File.count({
    where: {
      fileable_type: "ga_purchase_orders",
      fileable_id: id,
      category,
      is_active: true,
    },
    transaction: t1,
  });
}

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
    brand: source.brand,
    serial_number: source.serial_number,
    size: source.size,
    material: source.material,
    other: source.other,
    purchase_request_category: source.purchase_request_category,
    quantity_unit: source.quantity_unit,
    quantity: source.quantity,
    id_requester: source.id_requester,
    procurement_type: source.procurement_type,
    average_usage: input.average_usage ?? null,
    remarks: input.remarks ?? source.remarks,
    product_link: input.product_link ?? null,
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
      ...orderFileCategories.map((category) => ({
        model: db.File,
        as: category,
        required: false,
        where: { is_active: true },
      })),
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

  async saveReceiving(id, data, userId, t1, t2) {
    const updateData = {};
    for (const key of ["received_date", "receipt_note"])
      if (data[key] !== undefined) updateData[key] = data[key] || null;
    if (Object.keys(updateData).length)
      await mirrorUpdate("GaPurchaseOrder", id, updateData, t1, t2);
    for (const category of ["files_purchase_proof", "files_goods_receipt"])
      await syncFiles(
        "ga_purchase_orders",
        id,
        category,
        data[category],
        userId,
        t1,
        t2,
      );
  }

  async lockOrder(id, t1) {
    const order = await models.db1.GaPurchaseOrder.findByPk(id, {
      transaction: t1,
      lock: t1.LOCK.UPDATE,
    });
    if (!order) fail("GA purchase order not found", 404);
    return order;
  }

  // GA staff saves purchase proof and goods receipt before choosing accept or return.
  async updateReceiving(id, data, userId, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const order = await this.lockOrder(id, t1);
      if (order.status !== "request receiving")
        fail("Receiving data can only be edited while awaiting receiving", 409);
      await this.saveReceiving(id, data, userId, t1, t2);
    });
    return this.getById(id);
  }

  async action(id, action, userId, data = {}, isDoubleDatabase = true) {
    const flow = transitions[action];
    if (!flow) fail("Invalid action");
    const note = data.note;
    if (noteRequired(action) && !note?.trim())
      fail(`note is required for ${action === "return_goods" ? "return" : "rejection"}`);
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const order = await this.lockOrder(id, t1);
      const nextStatus = flow[order.status];
      if (!nextStatus)
        fail(`Action ${action} is not allowed from ${order.status}`, 409);
      const updateData = { status: nextStatus };

      if (action === "approve_cashier" && order.status === "request cashier") {
        const amount = Number(data.payment_amount);
        if (data.payment_amount == null || !Number.isFinite(amount) || amount <= 0)
          fail("payment_amount must be a positive number");
        if (!data.payment_date) fail("payment_date is required");
        Object.assign(updateData, {
          payment_amount: amount,
          payment_date: data.payment_date,
          payment_note: data.payment_note || null,
        });
        await syncFiles(
          "ga_purchase_orders",
          id,
          "files_payment",
          data.files_payment,
          userId,
          t1,
          t2,
        );
        if (!(await countFiles(id, "files_payment", t1)))
          fail("files_payment is required");
      }

      if (action === "accept_goods" || action === "return_goods")
        await this.saveReceiving(id, data, userId, t1, t2);

      if (action === "accept_goods") {
        const current = await models.db1.GaPurchaseOrder.findByPk(id, {
          attributes: ["received_date"],
          transaction: t1,
        });
        if (!current.received_date) fail("received_date is required");
        for (const category of ["files_purchase_proof", "files_goods_receipt"])
          if (!(await countFiles(id, category, t1)))
            fail(`${category} is required`);
        await inventoryService.addFromGaPurchaseOrder(id, userId, t1, t2);
      }

      if (action === "return_goods") updateData.return_count = order.return_count + 1;

      await mirrorUpdate("GaPurchaseOrder", id, updateData, t1, t2);
      await mirrorCreate(
        "GaPurchaseOrderVerificationProgress",
        {
          id_ga_purchase_order: id,
          id_user: userId,
          status: nextStatus,
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
