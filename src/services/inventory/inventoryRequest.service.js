const {
  models,
  fail,
  withTransactions,
  mirrorCreate,
  mirrorUpdate,
  syncFiles,
} = require("../procurement/shared");
const inventoryService = require("./inventory.service");

// item_name is not taken from the input; it is copied from the master item.
const fields = [
  "id_master_item",
  "brand",
  "model_number",
  "size",
  "material",
  "other",
  "purchase_request_category",
  "asset_category",
  "quantity_unit",
  "quantity",
  "received_date",
  "note",
  "id_company",
  "id_inventory_location",
];

function pick(input) {
  return Object.fromEntries(
    fields
      .filter((field) => input[field] !== undefined)
      .map((field) => [field, input[field]]),
  );
}

// Fields that decide the units of a request made with serial numbers; sending any
// of them on edit re-checks (and replaces) the units.
const unitFields = ["has_serial_number", "units", "quantity", "id_master_item"];

// Manual stock entry with a single approval step (approval_for "inventory request").
// Stock only reaches inventories when the request is approved. With
// has_serial_number, units holds one serial number per unit and each unit becomes
// its own inventory row on approval.
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
        attributes: ["id", "product_code", "item_name", "quantity", "quantity_unit"],
      },
      {
        model: db.MasterItem,
        as: "master_item",
        attributes: ["id", "item_code", "item_name"],
      },
      {
        model: db.InventoryRequestUnit,
        as: "units",
        separate: true,
        order: [["id", "ASC"]],
        attributes: ["id", "serial_number", "id_inventory"],
        include: [
          { model: db.Inventory, as: "inventory", attributes: ["id", "product_code"] },
        ],
      },
      { model: db.Company, as: "company", attributes: ["id", "company_name"] },
      {
        model: db.InventoryLocation,
        as: "inventory_location",
        attributes: ["id", "location_code", "location_name"],
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

  // Checks the company and location the request points to. An empty location
  // takes the company's default, so an edit sending only a new company also moves
  // to that company's default location. An edit sending neither keeps both.
  async resolvePlace(data, current, t1) {
    if (
      current &&
      data.id_company === undefined &&
      data.id_inventory_location === undefined
    )
      return data;
    const companyId = data.id_company ?? current?.id_company;
    if (!companyId) fail("id_company is required");
    const company = await models.db1.Company.findOne({
      where: { id: companyId, is_active: true },
      attributes: ["id", "id_inventory_location"],
      transaction: t1,
    });
    if (!company) fail("Company not found", 404);
    const locationId =
      data.id_inventory_location == null || data.id_inventory_location === ""
        ? company.id_inventory_location
        : data.id_inventory_location;
    if (!locationId)
      fail(
        "id_inventory_location is required: the company has no default inventory location",
      );
    const location = await models.db1.InventoryLocation.findOne({
      where: { id: locationId, is_active: true },
      attributes: ["id"],
      transaction: t1,
    });
    if (!location) fail("Inventory location not found", 404);
    return { ...data, id_company: company.id, id_inventory_location: location.id };
  }

  // Copies item_name from the master item when id_master_item is sent; it must be active.
  async resolveMaster(data, t1) {
    if (data.id_master_item === undefined) return data;
    const master = await models.db1.MasterItem.findOne({
      where: { id: data.id_master_item, is_active: true },
      attributes: ["id", "item_name"],
      transaction: t1,
    });
    if (!master) fail(`Master item ${data.id_master_item} not found`, 404);
    return { ...data, id_master_item: master.id, item_name: master.item_name };
  }

  // Serial numbers of a request with has_serial_number: one per unit of a whole
  // quantity, free in inventory, in draft goods receipts and in other pending
  // requests of the same master item. Returns null without serial numbers.
  async requestSerials(hasSerialNumber, quantity, masterId, units, requestId, t1) {
    if (!hasSerialNumber) return null;
    const count = Number(quantity);
    if (!Number.isInteger(count))
      fail(`quantity (${count}) must be a whole number to use serial numbers`);
    if (!Array.isArray(units) || units.length !== count)
      fail(`units must have ${count} entries, one serial number per unit`);
    const serials = units.map((unit, i) => {
      const serial = typeof unit?.serial_number === "string" ? unit.serial_number.trim() : "";
      if (!serial) fail(`units[${i}].serial_number is required`);
      return serial;
    });
    await inventoryService.assertSerialsAvailable(masterId, serials, t1);
    await inventoryService.assertSerialsNotReserved(masterId, serials, t1, {
      inventoryRequestId: requestId,
    });
    return serials;
  }

  // Saves serials as the request's units (none when serials is null); a new
  // request has no units to remove yet.
  async replaceUnits(requestId, serials, t1, t2, isNew = false) {
    if (!isNew) {
      const where = { id_inventory_request: requestId };
      await models.db1.InventoryRequestUnit.destroy({ where, transaction: t1 });
      if (t2) await models.db2.InventoryRequestUnit.destroy({ where, transaction: t2 });
    }
    for (const serial of serials ?? [])
      await mirrorCreate(
        "InventoryRequestUnit",
        { id_inventory_request: requestId, serial_number: serial },
        t1,
        t2,
      );
  }

  async createOne(input, userId, t1, t2) {
    const data = await this.resolveMaster(
      await this.resolvePlace(pick(input), null, t1),
      t1,
    );
    const hasSerialNumber = input.has_serial_number === true;
    const serials = await this.requestSerials(
      hasSerialNumber,
      data.quantity,
      data.id_master_item,
      input.units,
      null,
      t1,
    );
    const request = await mirrorCreate(
      "InventoryRequest",
      {
        ...data,
        has_serial_number: hasSerialNumber,
        status: "pending",
        id_user_request: userId,
      },
      t1,
      t2,
    );
    await this.replaceUnits(request.id, serials, t1, t2, true);
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
      const data = await this.resolveMaster(
        await this.resolvePlace(pick(input), request, t1),
        t1,
      );
      // Units are re-checked and replaced only when something that decides them is sent.
      if (unitFields.some((field) => input[field] !== undefined)) {
        const hasSerialNumber =
          input.has_serial_number === undefined
            ? request.has_serial_number
            : input.has_serial_number === true;
        const serials = await this.requestSerials(
          hasSerialNumber,
          data.quantity ?? request.quantity,
          data.id_master_item ?? request.id_master_item,
          input.units,
          request.id,
          t1,
        );
        if (input.has_serial_number !== undefined) data.has_serial_number = hasSerialNumber;
        // A request without serial numbers before and after has no units to touch.
        if (hasSerialNumber || request.has_serial_number)
          await this.replaceUnits(id, serials, t1, t2);
      }
      await mirrorUpdate("InventoryRequest", id, data, t1, t2);
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
      const request = await this.lockPending(id, t1);
      const inventoryIds = await inventoryService.addFromInventoryRequest(
        id,
        userId,
        t1,
        t2,
      );
      // With serial numbers each unit links its own row (units[].id_inventory).
      await mirrorUpdate(
        "InventoryRequest",
        id,
        {
          status: "approve",
          id_inventory: request.has_serial_number ? null : inventoryIds[0],
        },
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
