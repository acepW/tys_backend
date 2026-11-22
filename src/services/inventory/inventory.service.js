const { fn, col } = require("sequelize");
const {
  models,
  Op,
  fail,
  mirrorCreate,
  mirrorUpdate,
} = require("../procurement/shared");

// Incoming stock is added to an existing inventory row only when the item
// (master item, or item_name for rows without one), all of these and every
// matchKeys value match. A serial number makes each unit its own row.
const matchFields = [
  "brand",
  "model_number",
  "serial_number",
  "size",
  "material",
  "other",
];
const matchKeys = ["id_company", "id_inventory_location"];
// Fields matched by GET /inventories/check-stock, which keeps the old matching.
const legacyMatchFields = [
  "item_name",
  "brand",
  "serial_number",
  "size",
  "material",
  "other",
];
// Every spec field copied onto a newly created row.
const specFields = ["item_name", ...matchFields];

const PRODUCT_CODE_DIGITS = 5;

const normalize = (value) =>
  (typeof value === "string" ? value.trim() : value) || null;

const normalizeKey = (value) =>
  value == null || value === "" ? null : Number(value);

// Treat empty strings and NULL as the same "not filled" value.
const fieldMatch = (field, raw) => {
  const value = normalize(raw);
  return value === null
    ? { [Op.or]: [{ [field]: null }, { [field]: "" }] }
    : { [field]: value };
};

const keyMatches = (item) =>
  matchKeys.map((key) => ({ [key]: normalizeKey(item[key]) }));

// A master item is matched by id, so renaming it keeps the rows together. Rows
// without one (created before the master existed) are matched by item_name.
function matchWhere(item) {
  const masterId = normalizeKey(item.id_master_item);
  return {
    [Op.and]: [
      masterId === null
        ? { [Op.and]: [{ id_master_item: null }, fieldMatch("item_name", item.item_name)] }
        : { id_master_item: masterId },
      ...matchFields.map((field) => fieldMatch(field, item[field])),
      ...keyMatches(item),
    ],
  };
}

function legacyMatchWhere(item) {
  return {
    [Op.and]: [
      ...legacyMatchFields.map((field) => fieldMatch(field, item[field])),
      ...keyMatches(item),
    ],
  };
}

class InventoryService {
  includes(withHistories = false) {
    const db = models.db1;
    const base = [
      {
        model: db.File,
        as: "files_product",
        required: false,
        where: { is_active: true },
      },
      { model: db.Company, as: "company", attributes: ["id", "company_name"] },
      {
        model: db.InventoryLocation,
        as: "inventory_location",
        attributes: ["id", "location_code", "location_name"],
      },
      {
        model: db.MasterItem,
        as: "master_item",
        attributes: ["id", "item_code", "item_name"],
      },
    ];
    if (!withHistories) return base;
    return [
      ...base,
      {
        model: db.InventoryHistory,
        as: "histories",
        separate: true,
        order: [["createdAt", "DESC"]],
        include: [
          { model: db.User, as: "user", attributes: ["id", "name"] },
          {
            model: db.GaPurchaseOrder,
            as: "ga_purchase_order",
            attributes: ["id", "ga_purchase_order_no"],
          },
          {
            model: db.InventoryOpname,
            as: "inventory_opname",
            attributes: ["id", "opname_no"],
          },
          {
            model: db.InventoryMovement,
            as: "inventory_movement",
            attributes: ["id", "movement_no", "movement_type"],
          },
        ],
      },
    ];
  }

  async getById(id) {
    const row = await models.db1.Inventory.findByPk(id, {
      include: this.includes(true),
    });
    return row?.toJSON() || null;
  }

  async getAll(where = {}, page, limit) {
    const options = {
      where,
      include: this.includes(),
      order: [["item_name", "ASC"]],
      distinct: true,
    };
    if (page && limit) {
      options.limit = limit;
      options.offset = (page - 1) * limit;
      const { count, rows } =
        await models.db1.Inventory.findAndCountAll(options);
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
    return (await models.db1.Inventory.findAll(options)).map((row) =>
      row.toJSON(),
    );
  }

  // Stock of the inventory row matching every legacyMatchFields and matchKeys
  // value; 0 when none matches. Not updated for master items and serial numbers.
  async checkStock(input) {
    const row = await models.db1.Inventory.findOne({
      attributes: ["id", "quantity", "quantity_unit"],
      where: legacyMatchWhere(input),
    });
    return {
      id_inventory: row?.id ?? null,
      quantity: row ? Number(row.quantity) : 0,
      quantity_unit: row?.quantity_unit ?? null,
    };
  }

  // Next product code <item_code>-00001 for a master item: one more than the
  // highest number already in inventory. Locking the master row serializes the
  // codes of one item across transactions; within a transaction each created row
  // is seen by the next lookup. Codes are never reused, since rows are kept.
  async nextProductCode(masterId, t1) {
    const master = await models.db1.MasterItem.findByPk(masterId, {
      attributes: ["id", "item_code"],
      transaction: t1,
      lock: t1.LOCK.UPDATE,
    });
    if (!master) fail(`Master item ${masterId} not found`, 404);
    // Longer numbers first, so 100000 sorts after 99999.
    const last = await models.db1.Inventory.findOne({
      attributes: ["product_code"],
      where: { product_code: { [Op.like]: `${master.item_code}-%` } },
      order: [
        [fn("CHAR_LENGTH", col("product_code")), "DESC"],
        ["product_code", "DESC"],
      ],
      transaction: t1,
    });
    const next = last ? Number(last.product_code.split("-").pop()) + 1 : 1;
    return `${master.item_code}-${String(next).padStart(PRODUCT_CODE_DIGITS, "0")}`;
  }

  // Fails when a serial number is sent twice or is already held in stock
  // (quantity > 0) by another row of the same master item. Empty values are skipped.
  // The master row is locked first, so two receipts of the same item cannot both
  // pass the check with the same serial number.
  async assertSerialsAvailable(masterId, serials, t1) {
    const values = serials.map(normalize).filter(Boolean);
    const seen = new Set();
    for (const value of values) {
      if (seen.has(value)) fail(`serial_number ${value} is duplicated`);
      seen.add(value);
    }
    if (!values.length) return;
    if (normalizeKey(masterId) !== null)
      await models.db1.MasterItem.findByPk(masterId, {
        attributes: ["id"],
        transaction: t1,
        lock: t1.LOCK.UPDATE,
      });
    const taken = await models.db1.Inventory.findOne({
      attributes: ["id", "product_code", "serial_number"],
      where: {
        id_master_item: normalizeKey(masterId),
        serial_number: values,
        quantity: { [Op.gt]: 0 },
      },
      transaction: t1,
    });
    if (taken)
      fail(
        `serial_number ${taken.serial_number} already exists in inventory (${taken.product_code ?? `id ${taken.id}`})`,
        409,
      );
  }

  // Fails when a serial number of the same master item is already held by a
  // draft GA purchase order goods receipt or a pending inventory request, other
  // than the ones being saved (exclude.draftReceiptId / exclude.inventoryRequestId).
  async assertSerialsNotReserved(masterId, serials, t1, exclude = {}) {
    if (!serials.length) return;
    const db = models.db1;
    const master = { id_master_item: normalizeKey(masterId) };
    const draft = await db.GaPurchaseOrderItemReceiptUnit.findOne({
      attributes: ["serial_number"],
      where: { serial_number: serials },
      include: [
        {
          model: db.GaPurchaseOrderItemReceipt,
          as: "receipt",
          required: true,
          attributes: [],
          where: {
            type: "draft",
            ...(exclude.draftReceiptId && { id: { [Op.ne]: exclude.draftReceiptId } }),
          },
        },
        {
          model: db.GaPurchaseOrderItem,
          as: "ga_purchase_order_item",
          required: true,
          attributes: [],
          where: master,
        },
      ],
      transaction: t1,
    });
    if (draft)
      fail(`serial_number ${draft.serial_number} is already in another draft goods receipt`, 409);
    const request = await db.InventoryRequestUnit.findOne({
      attributes: ["serial_number"],
      where: { serial_number: serials },
      include: [
        {
          model: db.InventoryRequest,
          as: "inventory_request",
          required: true,
          attributes: [],
          where: {
            ...master,
            status: "pending",
            is_active: true,
            ...(exclude.inventoryRequestId && { id: { [Op.ne]: exclude.inventoryRequestId } }),
          },
        },
      ],
      transaction: t1,
    });
    if (request)
      fail(`serial_number ${request.serial_number} is already in a pending inventory request`, 409);
  }

  // Adds source.quantity to the inventory row matching the item, every
  // matchFields and matchKeys value (same item in the same company and location),
  // or creates a new row, then records the history and copies the product files.
  // A new row keeps source.product_code (a moved row) or, for a master item, gets
  // the next product code. source.received_date goes on the history and on a
  // newly created row. history holds the history row's source references and note.
  async addStock(source, history, userId, t1, t2) {
    let inventory = await models.db1.Inventory.findOne({
      where: matchWhere(source),
      transaction: t1,
      lock: t1.LOCK.UPDATE,
    });
    if (inventory) {
      await mirrorUpdate(
        "Inventory",
        inventory.id,
        {
          quantity: Number(inventory.quantity) + Number(source.quantity),
          ...(inventory.asset_category || !source.asset_category
            ? {}
            : { asset_category: source.asset_category }),
        },
        t1,
        t2,
      );
    } else {
      const masterId = normalizeKey(source.id_master_item);
      inventory = await mirrorCreate(
        "Inventory",
        {
          id_master_item: masterId,
          product_code:
            normalize(source.product_code) ||
            (masterId === null ? null : await this.nextProductCode(masterId, t1)),
          ...Object.fromEntries(
            specFields.map((field) => [field, normalize(source[field])]),
          ),
          ...Object.fromEntries(
            matchKeys.map((key) => [key, normalizeKey(source[key])]),
          ),
          purchase_request_category: source.purchase_request_category || null,
          asset_category: source.asset_category || null,
          quantity_unit: source.quantity_unit,
          quantity: source.quantity,
          received_date: source.received_date || null,
        },
        t1,
        t2,
      );
    }
    await mirrorCreate(
      "InventoryHistory",
      {
        ...history,
        id_inventory: inventory.id,
        id_user: userId,
        quantity: source.quantity,
        received_date: source.received_date || null,
      },
      t1,
      t2,
    );
    await this.copyProductFiles(inventory.id, source.files_product, userId, t1, t2);
    return inventory.id;
  }

  // Called inside the inventory request transaction when the request is approved.
  // Without serial numbers the quantity is added as one; with them each unit
  // becomes its own row of quantity 1 with its own product code, and the unit is
  // linked to it. Returns the inventory row ids.
  async addFromInventoryRequest(requestId, userId, t1, t2) {
    const request = await models.db1.InventoryRequest.findByPk(requestId, {
      include: [
        {
          model: models.db1.File,
          as: "files_product",
          required: false,
          where: { is_active: true },
        },
      ],
      transaction: t1,
    });
    // Requests created before company and location existed must be edited first.
    if (!request.id_company || !request.id_inventory_location)
      fail(
        "Inventory request needs id_company and id_inventory_location before approval",
        409,
      );
    const source = { ...(request.toJSON ? request.toJSON() : request), serial_number: null };
    const history = {
      id_inventory_request: request.id,
      note: normalize(request.note) || "Manual entry approved",
    };
    if (!request.has_serial_number)
      return [await this.addStock(source, history, userId, t1, t2)];
    const units = await models.db1.InventoryRequestUnit.findAll({
      where: { id_inventory_request: request.id },
      order: [["id", "ASC"]],
      transaction: t1,
    });
    // Stock may have changed since the request was saved.
    await this.assertSerialsAvailable(
      request.id_master_item,
      units.map((unit) => unit.serial_number),
      t1,
    );
    const ids = [];
    for (const unit of units) {
      const inventoryId = await this.addStock(
        { ...source, serial_number: unit.serial_number, quantity: 1 },
        history,
        userId,
        t1,
        t2,
      );
      await mirrorUpdate("InventoryRequestUnit", unit.id, { id_inventory: inventoryId }, t1, t2);
      ids.push(inventoryId);
    }
    return ids;
  }

  // Called inside the GA purchase order transaction when GA staff records a goods
  // receipt. Stock goes to the order's company, at that company's default
  // inventory location. Without units, the received quantity minus what was
  // returned is added as one quantity (the receipt's quantity_good is only the
  // inspection result). With units (a receipt with serial numbers), each unit
  // becomes its own row of quantity 1 with its own product code, and the unit is
  // linked to it. Returns the inventory row ids.
  async addFromGaPurchaseOrderReceipt(orderId, itemId, receipt, userId, t1, t2, units = null) {
    const order = await models.db1.GaPurchaseOrder.findByPk(orderId, {
      attributes: ["id", "id_company"],
      include: [
        {
          model: models.db1.Company,
          as: "company",
          attributes: ["id", "company_name", "id_inventory_location"],
        },
      ],
      transaction: t1,
    });
    if (!order.company?.id_inventory_location)
      fail(
        `Company ${order.company?.company_name ?? order.id_company} has no default inventory location; set it in master company first`,
        409,
      );
    const item = await models.db1.GaPurchaseOrderItem.findOne({
      where: { id: itemId, id_ga_purchase_order: orderId },
      include: [
        {
          model: models.db1.File,
          as: "files_product",
          required: false,
          where: { is_active: true },
        },
      ],
      transaction: t1,
    });
    const source = {
      ...(item.toJSON ? item.toJSON() : item),
      id_company: order.id_company,
      id_inventory_location: order.company.id_inventory_location,
      received_date: receipt.goods_in_date,
    };
    const history = {
      id_ga_purchase_order: orderId,
      id_ga_purchase_order_item: item.id,
      id_ga_purchase_order_item_receipt: receipt.id,
      note: `Goods ${receipt.type === "return" ? "partially accepted (rest returned)" : "accepted"} from GA purchase order`,
    };
    if (!units)
      return [
        await this.addStock(
          {
            ...source,
            serial_number: null,
            quantity:
              Math.round(
                (Number(receipt.quantity_received) - Number(receipt.quantity_returned)) * 100,
              ) / 100,
          },
          history,
          userId,
          t1,
          t2,
        ),
      ];
    const ids = [];
    for (const unit of units) {
      const inventoryId = await this.addStock(
        { ...source, serial_number: unit.serial_number, quantity: 1 },
        history,
        userId,
        t1,
        t2,
      );
      await mirrorUpdate(
        "GaPurchaseOrderItemReceiptUnit",
        unit.id,
        { id_inventory: inventoryId },
        t1,
        t2,
      );
      ids.push(inventoryId);
    }
    return ids;
  }

  // Copies the item's product files, skipping files the inventory already has.
  async copyProductFiles(inventoryId, files = [], userId, t1, t2) {
    if (!files.length) return;
    const existing = await models.db1.File.findAll({
      attributes: ["stored_name"],
      where: {
        fileable_type: "inventories",
        fileable_id: inventoryId,
        category: "files_product",
        is_active: true,
      },
      transaction: t1,
    });
    const storedNames = new Set(existing.map((file) => file.stored_name));
    for (const file of files) {
      if (storedNames.has(file.stored_name)) continue;
      storedNames.add(file.stored_name);
      const { id, fileable_type, fileable_id, category, createdAt, updatedAt, ...metadata } =
        file.toJSON ? file.toJSON() : file;
      await mirrorCreate(
        "File",
        {
          ...metadata,
          fileable_type: "inventories",
          fileable_id: inventoryId,
          category: "files_product",
          uploaded_by: userId,
          is_active: true,
        },
        t1,
        t2,
      );
    }
  }
}

module.exports = new InventoryService();
