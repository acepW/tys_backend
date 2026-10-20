const {
  models,
  fail,
  withTransactions,
  mirrorCreate,
  mirrorUpdate,
  syncFiles,
} = require("../procurement/shared");
const inventoryService = require("./inventory.service");

const fields = [
  "item_name",
  "brand",
  "serial_number",
  "size",
  "material",
  "other",
  "purchase_request_category",
  "asset_category",
  "quantity_unit",
  "quantity",
  "note",
];

function pick(input) {
  return Object.fromEntries(
    fields
      .filter((field) => input[field] !== undefined)
      .map((field) => [field, input[field]]),
  );
}

// Manual stock entry with a single approval step (approval_for "inventory request").
// Stock only reaches inventories when the request is approved.
class InventoryRequestService {
  includes() {
    const db = models.db1;
    return [
      {
        model: db.User,
        as: "user_request",
        attributes: ["id", "name", "email"],
      },
      {
        model: db.Inventory,
        as: "inventory",
        attributes: ["id", "item_name", "quantity", "quantity_unit"],
      },
      {
        model: db.File,
        as: "files_product",
        required: false,
        where: { is_active: true },
      },
      {
        model: db.InventoryRequestVerificationProgress,
        as: "verification_progress",
        separate: true,
        order: [["createdAt", "ASC"]],
        include: [{ model: db.User, as: "user", attributes: ["id", "name"] }],
      },
    ];
  }

  async getById(id) {
    const row = await models.db1.InventoryRequest.findOne({
      where: { id, is_active: true },
      include: this.includes(),
    });
    return row?.toJSON() || null;
  }

  async getAll(where = {}, page, limit) {
    const options = {
      where: { ...where, is_active: true },
      include: this.includes(),
      order: [["createdAt", "DESC"]],
      distinct: true,
    };
    if (page && limit) {
      options.limit = limit;
      options.offset = (page - 1) * limit;
      const { count, rows } =
        await models.db1.InventoryRequest.findAndCountAll(options);
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
    return (await models.db1.InventoryRequest.findAll(options)).map((row) =>
      row.toJSON(),
    );
  }

  async addProgress(id, userId, status, note, t1, t2) {
    await mirrorCreate(
      "InventoryRequestVerificationProgress",
      { id_inventory_request: id, id_user: userId, status, note: note || null },
      t1,
      t2,
    );
  }

  async lockPending(id, t1) {
    const request = await models.db1.InventoryRequest.findOne({
      where: { id, is_active: true },
      transaction: t1,
      lock: t1.LOCK.UPDATE,
    });
    if (!request) fail("Inventory request not found", 404);
    if (request.status !== "pending")
      fail(`Inventory request is already ${request.status}`, 409);
    return request;
  }

  async createOne(input, userId, t1, t2) {
    const request = await mirrorCreate(
      "InventoryRequest",
      { ...pick(input), status: "pending", id_user_request: userId },
      t1,
      t2,
    );
    await syncFiles(
      "inventory_requests",
      request.id,
      "files_product",
      input.files_product,
      userId,
      t1,
      t2,
    );
    await this.addProgress(request.id, userId, "pending", "Inventory request created", t1, t2);
    return request.id;
  }

  async create(input, userId, isDoubleDatabase = true) {
    const id = await withTransactions(isDoubleDatabase, (t1, t2) =>
      this.createOne(input, userId, t1, t2),
    );
    return this.getById(id);
  }

  // Creates one pending request per input in a single transaction (all or nothing).
  // Each request is then edited, approved and rejected on its own.
  async createMany(inputs, userId, isDoubleDatabase = true) {
    const ids = await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const created = [];
      for (const input of inputs)
        created.push(await this.createOne(input, userId, t1, t2));
      return created;
    });
    const rows = await models.db1.InventoryRequest.findAll({
      where: { id: ids, is_active: true },
      include: this.includes(),
      order: [["id", "ASC"]],
    });
    return rows.map((row) => row.toJSON());
  }

  async update(id, input, userId, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const request = await this.lockPending(id, t1);
      if (request.id_user_request !== userId)
        fail("Only the creator can edit this inventory request", 403);
      await mirrorUpdate("InventoryRequest", id, pick(input), t1, t2);
      await syncFiles(
        "inventory_requests",
        id,
        "files_product",
        input.files_product,
        userId,
        t1,
        t2,
      );
      await this.addProgress(id, userId, "pending", "Inventory request edited", t1, t2);
    });
    return this.getById(id);
  }

  async approve(id, userId, note, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      await this.lockPending(id, t1);
      const inventoryId = await inventoryService.addFromInventoryRequest(
        id,
        userId,
        t1,
        t2,
      );
      await mirrorUpdate(
        "InventoryRequest",
        id,
        { status: "approve", id_inventory: inventoryId },
        t1,
        t2,
      );
      await this.addProgress(id, userId, "approve", note, t1, t2);
    });
    return this.getById(id);
  }

  async reject(id, userId, note, isDoubleDatabase = true) {
    if (!note?.trim()) fail("note is required for rejection");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      await this.lockPending(id, t1);
      await mirrorUpdate("InventoryRequest", id, { status: "reject" }, t1, t2);
      await this.addProgress(id, userId, "reject", note, t1, t2);
    });
    return this.getById(id);
  }
}

module.exports = new InventoryRequestService();
