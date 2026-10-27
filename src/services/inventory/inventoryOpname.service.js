const {
  models,
  Op,
  fail,
  withTransactions,
  mirrorCreate,
  mirrorUpdate,
} = require("../procurement/shared");

// Inventory fields copied onto each opname item when the opname is created.
const itemFields = [
  "item_name",
  "brand",
  "serial_number",
  "size",
  "material",
  "other",
  "purchase_request_category",
  "quantity_unit",
];
// Item statuses the counting user may save, per ticket status. While the ticket is
// request only rejected items can be corrected; saving puts them back to "save".
const editableItemStatuses = {
  pending: ["pending", "save"],
  request: ["reject"],
};

// Rounds to 2 decimals so DECIMAL(15, 2) quantities compare exactly.
const round2 = (value) => Math.round(Number(value) * 100) / 100;

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

// OPN-MM-YYYY-0001; the sequence restarts every year.
async function nextOpnameNo(t1) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const last = await models.db1.InventoryOpname.findOne({
    attributes: ["opname_no"],
    where: {
      createdAt: {
        [Op.gte]: new Date(year, 0, 1),
        [Op.lt]: new Date(year + 1, 0, 1),
      },
    },
    order: [["id", "DESC"]],
    transaction: t1,
    lock: t1.LOCK.UPDATE,
  });
  const sequence = last ? Number(last.opname_no.split("-").pop()) + 1 : 1;
  return `OPN-${month}-${year}-${String(sequence).padStart(4, "0")}`;
}

class InventoryOpnameService {
  includes(withItems = false) {
    const db = models.db1;
    const includes = [
      {
        model: db.User,
        as: "user_opname",
        attributes: ["id", "name", "email"],
      },
      {
        model: db.InventoryOpnameVerificationProgress,
        as: "verification_progress",
        separate: true,
        order: [["createdAt", "ASC"]],
        include: [{ model: db.User, as: "user", attributes: ["id", "name"] }],
      },
    ];
    if (withItems)
      includes.push({
        model: db.InventoryOpnameItem,
        as: "items",
        separate: true,
        order: [
          ["item_name", "ASC"],
          ["id", "ASC"],
        ],
        include: [this.detailInclude()],
      });
    return includes;
  }

  detailInclude() {
    return {
      model: models.db1.InventoryOpnameItemDetail,
      as: "details",
      separate: true,
      order: [["id", "ASC"]],
    };
  }

  async getById(id) {
    const row = await models.db1.InventoryOpname.findOne({
      where: { id, is_active: true },
      include: this.includes(true),
    });
    return row?.toJSON() || null;
  }

  async getAll(where = {}, page, limit) {
    return findPage(
      models.db1.InventoryOpname,
      {
        where: { ...where, is_active: true },
        include: this.includes(),
        order: [["createdAt", "DESC"]],
        distinct: true,
      },
      page,
      limit,
    );
  }

  // Items of one opname, for paging through a large count.
  async getItems(id, where = {}, page, limit) {
    return findPage(
      models.db1.InventoryOpnameItem,
      {
        where: { ...where, id_inventory_opname: id },
        include: [this.detailInclude()],
        order: [
          ["item_name", "ASC"],
          ["id", "ASC"],
        ],
      },
      page,
      limit,
    );
  }

  // Progress is recorded per ticket action, not per item: an opname covers every
  // inventory row. Per-item review notes live in the item's review_note.
  async addProgress(id, userId, status, note, t1, t2) {
    await mirrorCreate(
      "InventoryOpnameVerificationProgress",
      {
        id_inventory_opname: id,
        id_user: userId,
        status,
        note: note || null,
      },
      t1,
      t2,
    );
  }

  async lockOpname(id, t1) {
    const opname = await models.db1.InventoryOpname.findOne({
      where: { id, is_active: true },
      transaction: t1,
      lock: t1.LOCK.UPDATE,
    });
    if (!opname) fail("Inventory opname not found", 404);
    return opname;
  }

  // Loads the requested items of the opname, failing on any ID it does not own.
  async lockItems(id, itemIds, t1) {
    const items = await models.db1.InventoryOpnameItem.findAll({
      where: { id: itemIds, id_inventory_opname: id },
      transaction: t1,
      lock: t1.LOCK.UPDATE,
    });
    const found = new Set(items.map((item) => item.id));
    const missing = itemIds.filter((itemId) => !found.has(itemId));
    if (missing.length)
      fail(`Inventory opname items not found: ${missing.join(", ")}`, 404);
    const byId = new Map(items.map((item) => [item.id, item]));
    return itemIds.map((itemId) => byId.get(itemId));
  }

  // Creates the ticket with every inventory row as a pending item. Only one opname
  // can be open at a time, because approval adds each item's difference against
  // the quantity copied here.
  async create(data, userId, isDoubleDatabase = true) {
    const id = await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const open = await models.db1.InventoryOpname.findOne({
        where: { status: ["pending", "request"], is_active: true },
        transaction: t1,
        lock: t1.LOCK.UPDATE,
      });
      if (open)
        fail(
          `Inventory opname ${open.opname_no} is still ${open.status}; finish it before creating a new one`,
          409,
        );
      const inventories = await models.db1.Inventory.findAll({
        order: [
          ["item_name", "ASC"],
          ["id", "ASC"],
        ],
        transaction: t1,
      });
      if (!inventories.length) fail("There is no inventory to count", 409);
      const opname = await mirrorCreate(
        "InventoryOpname",
        {
          opname_no: await nextOpnameNo(t1),
          opname_date: data.opname_date || new Date(),
          id_user_opname: userId,
          note: data.note || null,
          status: "pending",
        },
        t1,
        t2,
      );
      const items = inventories.map((inventory) => ({
        id_inventory_opname: opname.id,
        id_inventory: inventory.id,
        ...Object.fromEntries(itemFields.map((field) => [field, inventory[field]])),
        quantity_system: inventory.quantity,
        status: "pending",
      }));
      const created = await models.db1.InventoryOpnameItem.bulkCreate(items, {
        transaction: t1,
      });
      if (t2)
        await models.db2.InventoryOpnameItem.bulkCreate(
          items.map((item, index) => ({ ...item, id: created[index].id })),
          { transaction: t2 },
        );
      await this.addProgress(
        opname.id,
        userId,
        "pending",
        `Inventory opname created with ${items.length} items`,
        t1,
        t2,
      );
      return opname.id;
    });
    return this.getById(id);
  }

  // Replaces an item's status breakdown with details; [] clears it.
  async replaceDetails(itemId, details, t1, t2) {
    const where = { id_inventory_opname_item: itemId };
    await models.db1.InventoryOpnameItemDetail.destroy({ where, transaction: t1 });
    if (t2)
      await models.db2.InventoryOpnameItemDetail.destroy({ where, transaction: t2 });
    if (!details.length) return;
    const rows = details.map((detail) => ({
      id_inventory_opname_item: itemId,
      quantity: round2(detail.quantity),
      input_status: detail.input_status.trim(),
      note: detail.note || null,
    }));
    const created = await models.db1.InventoryOpnameItemDetail.bulkCreate(rows, {
      transaction: t1,
    });
    if (t2)
      await models.db2.InventoryOpnameItemDetail.bulkCreate(
        rows.map((row, index) => ({ ...row, id: created[index].id })),
        { transaction: t2 },
      );
  }

  // Saves the count of several items at once. Each input: { id, quantity_actual,
  // input_status, note, details? }. A saved item becomes "save". details is the
  // optional status breakdown ({ quantity, input_status, note }); when sent it
  // replaces the saved one, when left out the saved one is kept.
  async saveItems(id, inputs, userId, isDoubleDatabase = true) {
    const itemIds = inputs.map((input) => Number(input.id));
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const opname = await this.lockOpname(id, t1);
      const allowed = editableItemStatuses[opname.status];
      if (!allowed)
        fail(`Items cannot be edited while the opname is ${opname.status}`, 409);
      if (opname.id_user_opname !== userId)
        fail("Only the creator can edit this inventory opname", 403);
      const items = await this.lockItems(opname.id, itemIds, t1);
      let corrected = 0;
      for (const [index, item] of items.entries()) {
        if (item.status === "reject") corrected++;
        if (!allowed.includes(item.status))
          fail(
            `Item ${item.id} (${item.item_name}) cannot be edited while it is ${item.status}`,
            409,
          );
        const input = inputs[index];
        const actual = round2(input.quantity_actual);
        await mirrorUpdate(
          "InventoryOpnameItem",
          item.id,
          {
            quantity_actual: actual,
            quantity_difference: round2(actual - item.quantity_system),
            input_status: input.input_status?.trim() || null,
            note: input.note || null,
            status: "save",
          },
          t1,
          t2,
        );
        if (input.details !== undefined)
          await this.replaceDetails(item.id, input.details, t1, t2);
      }
      await this.addProgress(
        opname.id,
        userId,
        "save items",
        `${items.length} items saved${corrected ? ` (${corrected} rejected items corrected)` : ""}`,
        t1,
        t2,
      );
    });
    return this.getById(id);
  }

  // Sends a fully counted opname to the approver.
  async request(id, userId, note, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const opname = await this.lockOpname(id, t1);
      if (opname.status !== "pending")
        fail(`Inventory opname is already ${opname.status}`, 409);
      if (opname.id_user_opname !== userId)
        fail("Only the creator can request this inventory opname", 403);
      const unsaved = await models.db1.InventoryOpnameItem.count({
        where: { id_inventory_opname: opname.id, status: { [Op.ne]: "save" } },
        transaction: t1,
      });
      if (unsaved)
        fail(`${unsaved} items have not been saved yet`, 409);
      await mirrorUpdate("InventoryOpname", opname.id, { status: "request" }, t1, t2);
      await this.addProgress(opname.id, userId, "request", note, t1, t2);
    });
    return this.getById(id);
  }

  // Approves or rejects several saved items at once. Each input: { id, decision:
  // "approve" | "reject", note }; a rejection needs a note.
  async reviewItems(id, inputs, userId, isDoubleDatabase = true) {
    const itemIds = inputs.map((input) => Number(input.id));
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const opname = await this.lockOpname(id, t1);
      if (opname.status !== "request")
        fail(`Items can only be reviewed while the opname is request`, 409);
      const items = await this.lockItems(opname.id, itemIds, t1);
      const counts = { approve: 0, reject: 0 };
      for (const [index, item] of items.entries()) {
        if (item.status !== "save")
          fail(
            `Item ${item.id} (${item.item_name}) cannot be reviewed while it is ${item.status}`,
            409,
          );
        const { decision, note } = inputs[index];
        await mirrorUpdate(
          "InventoryOpnameItem",
          item.id,
          { status: decision, review_note: note || null },
          t1,
          t2,
        );
        counts[decision]++;
      }
      await this.addProgress(
        opname.id,
        userId,
        "review items",
        `${counts.approve} items approved, ${counts.reject} items rejected`,
        t1,
        t2,
      );
    });
    return this.getById(id);
  }

  // Once every item is approved, adds each item's difference to its inventory row
  // and records it in the inventory history.
  async approve(id, userId, note, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const opname = await this.lockOpname(id, t1);
      if (opname.status !== "request")
        fail(`Inventory opname cannot be approved while it is ${opname.status}`, 409);
      const notApproved = await models.db1.InventoryOpnameItem.count({
        where: { id_inventory_opname: opname.id, status: { [Op.ne]: "approve" } },
        transaction: t1,
      });
      if (notApproved)
        fail(`${notApproved} items have not been approved yet`, 409);
      const items = await models.db1.InventoryOpnameItem.findAll({
        where: {
          id_inventory_opname: opname.id,
          quantity_difference: { [Op.ne]: 0 },
        },
        order: [["id", "ASC"]],
        transaction: t1,
      });
      for (const item of items) {
        const inventory = await models.db1.Inventory.findByPk(item.id_inventory, {
          transaction: t1,
          lock: t1.LOCK.UPDATE,
        });
        if (!inventory)
          fail(`Inventory for item ${item.id} (${item.item_name}) not found`, 404);
        const quantity = round2(Number(inventory.quantity) + Number(item.quantity_difference));
        if (quantity < 0)
          fail(
            `Stock of ${item.item_name} would become negative (${quantity})`,
            409,
          );
        await mirrorUpdate("Inventory", inventory.id, { quantity }, t1, t2);
        await mirrorCreate(
          "InventoryHistory",
          {
            id_inventory: inventory.id,
            id_inventory_opname: opname.id,
            id_inventory_opname_item: item.id,
            id_user: userId,
            quantity: item.quantity_difference,
            note: `Stock opname ${opname.opname_no}`,
          },
          t1,
          t2,
        );
      }
      await mirrorUpdate("InventoryOpname", opname.id, { status: "approved" }, t1, t2);
      await this.addProgress(opname.id, userId, "approved", note, t1, t2);
    });
    return this.getById(id);
  }

  // The creator can drop a pending opname, e.g. one created by mistake, so a new
  // one can be started.
  async cancel(id, userId, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const opname = await this.lockOpname(id, t1);
      if (opname.status !== "pending")
        fail("Only a pending inventory opname can be cancelled", 409);
      if (opname.id_user_opname !== userId)
        fail("Only the creator can cancel this inventory opname", 403);
      await mirrorUpdate("InventoryOpname", opname.id, { is_active: false }, t1, t2);
      await this.addProgress(opname.id, userId, "cancelled", null, t1, t2);
    });
  }
}

module.exports = new InventoryOpnameService();
