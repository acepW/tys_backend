const {
  models,
  Op,
  withTransactions,
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

  // Manual stock entry: adds to the matching inventory row or creates a new one.
  async createManual(input, userId, isDoubleDatabase = true) {
    const id = await withTransactions(isDoubleDatabase, async (t1, t2) => {
      let inventory = await models.db1.Inventory.findOne({
        where: matchWhere(input),
        transaction: t1,
        lock: t1.LOCK.UPDATE,
      });
      if (inventory) {
        await mirrorUpdate(
          "Inventory",
          inventory.id,
          { quantity: Number(inventory.quantity) + Number(input.quantity) },
          t1,
          t2,
        );
      } else {
        inventory = await mirrorCreate(
          "Inventory",
          {
            ...Object.fromEntries(
              matchFields.map((field) => [field, normalize(input[field])]),
            ),
            purchase_request_category: input.purchase_request_category || null,
            quantity_unit: input.quantity_unit,
            quantity: input.quantity,
          },
          t1,
          t2,
        );
      }
      await mirrorCreate(
        "InventoryHistory",
        {
          id_inventory: inventory.id,
          id_user: userId,
          quantity: input.quantity,
          note: normalize(input.note) || "Manual entry",
        },
        t1,
        t2,
      );
      await this.copyProductFiles(inventory.id, input.files_product, userId, t1, t2);
      return inventory.id;
    });
    return this.getById(id);
  }

  // Called inside the GA purchase order transaction when the goods are accepted.
  async addFromGaPurchaseOrder(orderId, userId, t1, t2) {
    const items = await models.db1.GaPurchaseOrderItem.findAll({
      where: { id_ga_purchase_order: orderId },
      include: [
        {
          model: models.db1.File,
          as: "files_product",
          required: false,
          where: { is_active: true },
        },
      ],
      order: [["id", "ASC"]],
      transaction: t1,
    });
    for (const item of items) {
      let inventory = await models.db1.Inventory.findOne({
        where: matchWhere(item),
        transaction: t1,
        lock: t1.LOCK.UPDATE,
      });
      if (inventory) {
        await mirrorUpdate(
          "Inventory",
          inventory.id,
          { quantity: Number(inventory.quantity) + Number(item.quantity) },
          t1,
          t2,
        );
      } else {
        inventory = await mirrorCreate(
          "Inventory",
          {
            ...Object.fromEntries(
              matchFields.map((field) => [field, normalize(item[field])]),
            ),
            purchase_request_category: item.purchase_request_category,
            quantity_unit: item.quantity_unit,
            quantity: item.quantity,
          },
          t1,
          t2,
        );
      }
      await mirrorCreate(
        "InventoryHistory",
        {
          id_inventory: inventory.id,
          id_ga_purchase_order: orderId,
          id_ga_purchase_order_item: item.id,
          id_user: userId,
          quantity: item.quantity,
          note: "Goods accepted from GA purchase order",
        },
        t1,
        t2,
      );
      await this.copyProductFiles(inventory.id, item.files_product, userId, t1, t2);
    }
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
