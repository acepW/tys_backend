const {
  models,
  Op,
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
// Order fields that hold the sum of the same item fields.
const orderTotalFields = ["sub_total", ...taxAmounts, "total"];
const orderFileCategories = ["file_attachment", "files_payment"];
// Purchase realization files, saved per item before it can be accepted or returned.
const realizationFileCategories = ["files_purchase_proof", "files_invoice"];
// Goods receipt files, required on every accept and return.
const receiptFileCategories = ["files_goods_in", "files_goods_receipt"];
// Extra files required when goods are shipped back to the vendor.
const returnFileCategories = [
  "files_return_delivery_proof",
  "files_return_waybill",
];
const itemFileCategories = [
  "files_product",
  "files_attachment",
  ...realizationFileCategories,
  "files_refund_proof",
  "files_refund_received_proof",
];
// Item receiving statuses that still block the order from finishing.
const unsettledStatuses = ["pending", "returned", "refund requested"];
const goodsStatuses = [
  "Good Without Exception",
  "Good With Notes",
  "Not Good",
];
const paymentMethods = ["petty cash", "bank"];
const pettyCashMethods = ["cash", "transfer"];

// Approval flow: action -> { current status: next status }.
// Goods receiving is per item (acceptItem / returnItem); the order finishes once
// every item is accepted. Statuses prefixed with "return" belong to the old
// order-level return cycle and are kept only so orders already in it can finish.
const transitions = {
  approve_ga_manager: {
    "request ga manager": "request director",
    "return request ga manager": "return request cashier",
  },
  reject_ga_manager: {
    "request ga manager": "rejected ga manager",
    "return request ga manager": "request receiving",
  },
  approve_director: { "request director": "request spv/manager fat" },
  reject_director: { "request director": "rejected director" },
  approve_fat: { "request spv/manager fat": "request cashier" },
  reject_fat: { "request spv/manager fat": "rejected spv/manager fat" },
  approve_cashier: {
    "request cashier": "request receiving",
    "return request cashier": "request receiving",
  },
  reject_cashier: {
    "request cashier": "rejected cashier",
    "return request cashier": "request receiving",
  },
};
// Verification progress records what the actor did, not the order's next status.
const progressStatuses = {
  approve_ga_manager: "approved ga manager",
  reject_ga_manager: "rejected ga manager",
  approve_director: "approved director",
  reject_director: "rejected director",
  approve_fat: "approved spv/manager fat",
  reject_fat: "rejected spv/manager fat",
  approve_cashier: "approved cashier",
  reject_cashier: "rejected cashier",
};

async function countFiles(type, id, category, t1) {
  return models.db1.File.count({
    where: {
      fileable_type: type,
      fileable_id: id,
      category,
      is_active: true,
    },
    transaction: t1,
  });
}

// Syncs each category from data, then requires at least one active file in it.
async function syncRequiredFiles(type, id, categories, data, userId, t1, t2) {
  for (const category of categories) {
    await syncFiles(type, id, category, data[category], userId, t1, t2);
    if (!(await countFiles(type, id, category, t1)))
      fail(`${category} is required`);
  }
}

// Rounds to 2 decimals so DECIMAL(15, 2) quantities and amounts compare exactly.
const round2 = (value) => Math.round(Number(value) * 100) / 100;

function parseAmount(value, key, positive = false) {
  const amount = Number(value);
  if (
    value == null ||
    value === "" ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    (positive && amount === 0)
  )
    fail(`${key} must be a ${positive ? "positive" : "non-negative"} number`);
  return round2(amount);
}

async function findPage(model, options, page, limit) {
  if (!page || !limit)
    return (await model.findAll(options)).map((row) => row.toJSON());
  const { count, rows } = await model.findAndCountAll({
    ...options,
    limit,
    offset: (page - 1) * limit,
  });
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
    item_category: source.item_category,
    asset_category: source.asset_category,
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
      await documentNumbers("GaPurchaseOrder", "GAPO", isDoubleDatabase, {
        withMonth: true,
      })
    ).map((row) => ({
      ...row,
      no_ga_purchase_order: row.document_no,
    }));
  }

  itemIncludes() {
    const db = models.db1;
    const activeFiles = (category) => ({
      model: db.File,
      as: category,
      required: false,
      where: { is_active: true },
    });
    return [
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
      ...itemFileCategories.map(activeFiles),
      {
        model: db.GaPurchaseOrderItemReceipt,
        as: "receipts",
        separate: true,
        order: [["id", "ASC"]],
        include: [
          { model: db.User, as: "user", attributes: ["id", "name"] },
          ...[...receiptFileCategories, ...returnFileCategories].map(
            activeFiles,
          ),
        ],
      },
    ];
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
        include: this.itemIncludes(),
      },
      {
        model: db.GaPurchaseOrderVerificationProgress,
        as: "verification_progress",
        separate: true,
        order: [["createdAt", "ASC"]],
        include: [
          { model: db.User, as: "user", attributes: ["id", "name"] },
          {
            model: db.GaPurchaseOrderItem,
            as: "ga_purchase_order_item",
            attributes: ["id", "item_name"],
          },
        ],
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
    return findPage(
      models.db1.GaPurchaseOrder,
      {
        where,
        include: this.includes(),
        order: [["createdAt", "DESC"]],
        distinct: true,
      },
      page,
      limit,
    );
  }

  // Items returned at least once, with their order, goods receipts and refund data.
  // itemWhere filters the items; orderWhere filters their orders; search matches
  // the item name or the GA purchase order number.
  async getReturnedItems(itemWhere = {}, orderWhere = {}, page, limit, search) {
    const db = models.db1;
    const where = { ...itemWhere, return_count: { [Op.gt]: 0 } };
    if (search) {
      const like = { [Op.like]: `%${search}%` };
      // Matching order IDs are looked up first so the item query stays paginatable.
      const orders = await db.GaPurchaseOrder.findAll({
        attributes: ["id"],
        where: { ga_purchase_order_no: like },
        raw: true,
      });
      where[Op.or] = [
        { item_name: like },
        { id_ga_purchase_order: orders.map((order) => order.id) },
      ];
    }
    return findPage(
      db.GaPurchaseOrderItem,
      {
        where,
        include: [
          {
            model: db.GaPurchaseOrder,
            as: "ga_purchase_order",
            required: true,
            where: orderWhere,
            attributes: [
              "id",
              "ga_purchase_order_no",
              "id_company",
              "request_date",
              "status",
            ],
            include: [
              {
                model: db.Company,
                as: "company",
                attributes: ["id", "company_name", "initial_company"],
              },
            ],
          },
          ...this.itemIncludes(),
        ],
        order: [["updatedAt", "DESC"]],
        distinct: true,
      },
      page,
      limit,
    );
  }

  // Order totals are the sums of the item values.
  async updateTotals(orderId, t1, t2) {
    const items = await models.db1.GaPurchaseOrderItem.findAll({
      attributes: orderTotalFields,
      where: { id_ga_purchase_order: orderId },
      transaction: t1,
    });
    const totals = Object.fromEntries(
      orderTotalFields.map((key) => [
        key,
        round2(items.reduce((sum, item) => sum + Number(item[key]), 0)),
      ]),
    );
    await mirrorUpdate("GaPurchaseOrder", orderId, totals, t1, t2);
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
      await this.updateTotals(order.id, t1, t2);
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
      if (items !== undefined) {
        await this.syncItems(id, order.id_company, items, userId, t1, t2);
        await this.updateTotals(id, t1, t2);
      }
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

  async lockOrder(id, t1) {
    const order = await models.db1.GaPurchaseOrder.findByPk(id, {
      transaction: t1,
      lock: t1.LOCK.UPDATE,
    });
    if (!order) fail("GA purchase order not found", 404);
    return order;
  }

  async addProgress(id, userId, status, note, itemId, t1, t2) {
    await mirrorCreate(
      "GaPurchaseOrderVerificationProgress",
      {
        id_ga_purchase_order: id,
        id_ga_purchase_order_item: itemId ?? null,
        id_user: userId,
        status,
        note: note || null,
      },
      t1,
      t2,
    );
  }

  async action(id, action, userId, data = {}, isDoubleDatabase = true) {
    const flow = transitions[action];
    if (!flow) fail("Invalid action");
    const note = data.note;
    if (action.startsWith("reject") && !note?.trim())
      fail("note is required for rejection");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const order = await this.lockOrder(id, t1);
      const nextStatus = flow[order.status];
      if (!nextStatus)
        fail(`Action ${action} is not allowed from ${order.status}`, 409);
      const progressStatus = `${order.status.startsWith("return") ? "return " : ""}${progressStatuses[action]}`;
      const updateData = { status: nextStatus };

      if (action === "approve_cashier" && order.status === "request cashier") {
        const amount = Number(data.payment_amount);
        if (data.payment_amount == null || !Number.isFinite(amount) || amount <= 0)
          fail("payment_amount must be a positive number");
        if (!data.payment_date) fail("payment_date is required");
        if (!paymentMethods.includes(data.payment_method))
          fail("payment_method must be petty cash or bank");
        const isPettyCash = data.payment_method === "petty cash";
        if (isPettyCash && !pettyCashMethods.includes(data.petty_cash_method))
          fail("petty_cash_method must be cash or transfer");
        Object.assign(updateData, {
          payment_amount: amount,
          payment_date: data.payment_date,
          payment_method: data.payment_method,
          petty_cash_method: isPettyCash ? data.petty_cash_method : null,
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
        if (!(await countFiles("ga_purchase_orders", id, "files_payment", t1)))
          fail("files_payment is required");
      }

      await mirrorUpdate("GaPurchaseOrder", id, updateData, t1, t2);
      await this.addProgress(id, userId, progressStatus, note, null, t1, t2);
    });
    return this.getById(id);
  }

  // Locks the order and loads one of its items whose receiving_status is in statuses.
  async receivingItem(id, itemId, t1, statuses) {
    const order = await this.lockOrder(id, t1);
    if (order.status !== "request receiving")
      fail("Items can only be received while the order awaits receiving", 409);
    const item = await models.db1.GaPurchaseOrderItem.findOne({
      where: { id: itemId, id_ga_purchase_order: id },
      transaction: t1,
    });
    if (!item) fail("GA purchase order item not found", 404);
    if (statuses && !statuses.includes(item.receiving_status)) {
      if (item.receiving_status === "accepted")
        fail("Item has already been accepted", 409);
      if (item.receiving_status === "refunded")
        fail("Item has already been settled with a refund", 409);
      fail(`Action is not allowed while the item is ${item.receiving_status}`, 409);
    }
    return item;
  }

  // GA staff saves (or corrects) the purchase realization of one item. It must be
  // saved before the item can be accepted or returned.
  async saveRealization(id, itemId, userId, data = {}, isDoubleDatabase = true) {
    if (!data.purchase_realization_date)
      fail("purchase_realization_date is required");
    const amount = parseAmount(
      data.purchase_realization_amount,
      "purchase_realization_amount",
    );
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const item = await this.receivingItem(id, itemId, t1);
      const progressStatus = item.purchase_realization_date
        ? "purchase realization updated"
        : "purchase realization saved";
      await syncRequiredFiles(
        "ga_purchase_order_items",
        item.id,
        realizationFileCategories,
        data,
        userId,
        t1,
        t2,
      );
      await mirrorUpdate(
        "GaPurchaseOrderItem",
        item.id,
        {
          purchase_realization_date: data.purchase_realization_date,
          purchase_realization_amount: amount,
          purchase_realization_note: data.note || null,
        },
        t1,
        t2,
      );
      await this.addProgress(id, userId, progressStatus, data.note, item.id, t1, t2);
    });
    return this.getById(id);
  }

  // Records a goods receipt for the item's outstanding quantity (quantity minus
  // good and refunded). Accept means all of it is good; return keeps quantity_good
  // and ships the rest back to the vendor, to be accepted again or refunded.
  // Good quantity of item_category "item" goes into inventory.
  async receiveItem(type, id, itemId, userId, data, isDoubleDatabase) {
    const isReturn = type === "return";
    if (isReturn && !data.note?.trim()) fail("note is required for return");
    if (!data.goods_in_date) fail("goods_in_date is required");
    if (!goodsStatuses.includes(data.goods_status))
      fail(`goods_status must be one of: ${goodsStatuses.join(", ")}`);
    const quantityGood = parseAmount(data.quantity_good, "quantity_good");
    let shippingCost = null;
    if (isReturn) {
      if (!data.return_delivery_date) fail("return_delivery_date is required");
      shippingCost = parseAmount(
        data.return_shipping_cost,
        "return_shipping_cost",
      );
    }
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const item = await this.receivingItem(id, itemId, t1, [
        "pending",
        "returned",
      ]);
      if (!item.purchase_realization_date)
        fail("Purchase realization must be saved before receiving the item", 409);
      const outstanding = round2(
        item.quantity - item.quantity_good - item.quantity_refunded,
      );
      if (!isReturn && quantityGood !== outstanding)
        fail(
          `quantity_good must equal the outstanding quantity (${outstanding}); use return to send part of it back`,
        );
      if (isReturn && quantityGood >= outstanding)
        fail(
          `quantity_good must be less than the outstanding quantity (${outstanding}) when returning`,
        );
      const quantityReturned = round2(outstanding - quantityGood);
      const receipt = await mirrorCreate(
        "GaPurchaseOrderItemReceipt",
        {
          id_ga_purchase_order: item.id_ga_purchase_order,
          id_ga_purchase_order_item: item.id,
          id_user: userId,
          type,
          quantity_received: outstanding,
          quantity_good: quantityGood,
          quantity_returned: quantityReturned,
          goods_in_date: data.goods_in_date,
          goods_status: data.goods_status,
          return_delivery_date: isReturn ? data.return_delivery_date : null,
          return_shipping_cost: shippingCost,
          note: data.note || null,
        },
        t1,
        t2,
      );
      await syncRequiredFiles(
        "ga_purchase_order_item_receipts",
        receipt.id,
        isReturn
          ? [...receiptFileCategories, ...returnFileCategories]
          : receiptFileCategories,
        data,
        userId,
        t1,
        t2,
      );
      await mirrorUpdate(
        "GaPurchaseOrderItem",
        item.id,
        {
          receiving_status: isReturn ? "returned" : "accepted",
          quantity_good: round2(Number(item.quantity_good) + quantityGood),
          quantity_returned: quantityReturned,
          receiving_note: data.note || null,
          ...(isReturn && { return_count: item.return_count + 1 }),
        },
        t1,
        t2,
      );
      if (item.item_category === "item" && quantityGood > 0)
        await inventoryService.addFromGaPurchaseOrderReceipt(
          item.id_ga_purchase_order,
          item.id,
          receipt,
          userId,
          t1,
          t2,
        );
      await this.addProgress(
        id,
        userId,
        isReturn ? "goods returned" : "goods accepted",
        data.note,
        item.id,
        t1,
        t2,
      );
      if (!isReturn) await this.finishIfSettled(id, userId, t1, t2);
    });
    return this.getById(id);
  }

  async acceptItem(id, itemId, userId, data = {}, isDoubleDatabase = true) {
    return this.receiveItem("accept", id, itemId, userId, data, isDoubleDatabase);
  }

  async returnItem(id, itemId, userId, data = {}, isDoubleDatabase = true) {
    return this.receiveItem("return", id, itemId, userId, data, isDoubleDatabase);
  }

  // GA staff asks to settle the returned quantity with a refund instead of a
  // replacement. The refund covers all of quantity_returned and waits for FAT.
  async requestRefund(id, itemId, userId, data = {}, isDoubleDatabase = true) {
    if (!data.refund_date) fail("refund_date is required");
    const amount = parseAmount(data.refund_amount, "refund_amount", true);
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const item = await this.receivingItem(id, itemId, t1, ["returned"]);
      await syncRequiredFiles(
        "ga_purchase_order_items",
        item.id,
        ["files_refund_proof"],
        data,
        userId,
        t1,
        t2,
      );
      await mirrorUpdate(
        "GaPurchaseOrderItem",
        item.id,
        {
          receiving_status: "refund requested",
          refund_date: data.refund_date,
          refund_amount: amount,
          refund_note: data.note || null,
        },
        t1,
        t2,
      );
      await this.addProgress(id, userId, "refund requested", data.note, item.id, t1, t2);
    });
    return this.getById(id);
  }

  // FAT SPV/Manager approves or rejects an item refund; the order status is unchanged.
  // Approval records when the refund money was received (with proof) and settles
  // the returned quantity; rejection puts the item back to returned.
  async refundDecision(id, itemId, userId, approve, data = {}, isDoubleDatabase = true) {
    if (!approve && !data.note?.trim()) fail("note is required for rejection");
    if (approve && !data.refund_received_date)
      fail("refund_received_date is required");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const item = await this.receivingItem(id, itemId, t1, ["refund requested"]);
      if (approve)
        await syncRequiredFiles(
          "ga_purchase_order_items",
          item.id,
          ["files_refund_received_proof"],
          data,
          userId,
          t1,
          t2,
        );
      await mirrorUpdate(
        "GaPurchaseOrderItem",
        item.id,
        approve
          ? {
              receiving_status: "refunded",
              quantity_refunded: round2(
                Number(item.quantity_refunded) + Number(item.quantity_returned),
              ),
              quantity_returned: 0,
              refund_received_date: data.refund_received_date,
            }
          : { receiving_status: "returned" },
        t1,
        t2,
      );
      await this.addProgress(
        id,
        userId,
        `refund ${approve ? "approved" : "rejected"} spv/manager fat`,
        data.note,
        item.id,
        t1,
        t2,
      );
      if (approve) await this.finishIfSettled(id, userId, t1, t2);
    });
    return this.getById(id);
  }

  // The order finishes once every item is accepted or settled with a refund.
  async finishIfSettled(id, userId, t1, t2) {
    const remaining = await models.db1.GaPurchaseOrderItem.count({
      where: { id_ga_purchase_order: id, receiving_status: unsettledStatuses },
      transaction: t1,
    });
    if (remaining) return;
    await mirrorUpdate("GaPurchaseOrder", id, { status: "finished" }, t1, t2);
    await this.addProgress(id, userId, "finished", "All items settled", null, t1, t2);
  }
}

module.exports = new GaPurchaseOrderService();
