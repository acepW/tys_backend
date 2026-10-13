const {
  models,
  Op,
  mirrorCreate,
  mirrorUpdate,
} = require("../procurement/shared");

// An order item is added to an existing inventory row only when all of these match.
const matchFields = [
  "item_name",
  "brand",
  "serial_number",
  "size",
  "material",
  "other",
];

const normalize = (value) =>
  (typeof value === "string" ? value.trim() : value) || null;

function matchWhere(item) {
  return {
    [Op.and]: matchFields.map((field) => {
      const value = normalize(item[field]);
      // Treat empty strings and NULL as the same "not filled" value.
      return value === null
        ? { [Op.or]: [{ [field]: null }, { [field]: "" }] }
        : { [field]: value };
    }),
  };
}

class InventoryService {
  includes(withHistories = false) {
    const db = models.db1;
    const files = {
      model: db.File,
      as: "files_product",
      required: false,
      where: { is_active: true },
    };
    if (!withHistories) return [files];
    return [
      files,
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

  // Stock of the inventory row matching every matchFields value; 0 when none matches.
  async checkStock(input) {
    const row = await models.db1.Inventory.findOne({
      attributes: ["id", "quantity", "quantity_unit"],
      where: matchWhere(input),
    });
    return {
      id_inventory: row?.id ?? null,
      quantity: row ? Number(row.quantity) : 0,
      quantity_unit: row?.quantity_unit ?? null,
    };
  }

  // Adds source.quantity to the inventory row matching every matchFields value, or
  // creates a new row, then records the history and copies the product files.
  // history holds the history row's source references and note.
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
      inventory = await mirrorCreate(
        "Inventory",
        {
          ...Object.fromEntries(
            matchFields.map((field) => [field, normalize(source[field])]),
          ),
          purchase_request_category: source.purchase_request_category || null,
          asset_category: source.asset_category || null,
          quantity_unit: source.quantity_unit,
          quantity: source.quantity,
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
      },
      t1,
      t2,
    );
    await this.copyProductFiles(inventory.id, source.files_product, userId, t1, t2);
    return inventory.id;
  }

  // Called inside the inventory request transaction when the request is approved.
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
    return this.addStock(
      request,
      {
        id_inventory_request: request.id,
        note: normalize(request.note) || "Manual entry approved",
      },
      userId,
      t1,
      t2,
    );
  }

  // Called inside the GA purchase order transaction when GA staff accepts an item.
  async addFromGaPurchaseOrderItem(orderId, itemId, userId, t1, t2) {
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
    return this.addStock(
      item,
      {
        id_ga_purchase_order: orderId,
        id_ga_purchase_order_item: item.id,
        note: "Goods accepted from GA purchase order",
      },
      userId,
      t1,
      t2,
    );
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
