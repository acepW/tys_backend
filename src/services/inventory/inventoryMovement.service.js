const {
  models,
  fail,
  withTransactions,
  mirrorCreate,
  mirrorUpdate,
  nextCompanyNo,
} = require("../procurement/shared");
const inventoryService = require("./inventory.service");

// Status that waits for each approval -> status after it is approved.
const nextStatus = {
  "request spv ga": "request manager ga",
  "request manager ga": "approved",
};
// Who acts at each open status, for the progress status.
const approverOf = {
  "request spv ga": "spv ga",
  "request manager ga": "manager ga",
};

// Rounds to 2 decimals so DECIMAL(15, 2) quantities compare exactly.
const round2 = (value) => Math.round(Number(value) * 100) / 100;

// Stock transfer and stock allocation (putaway) both move stock of one inventory
// row to another location of the same company (approval_for "inventory movement").
// SPV GA approves, then Manager GA; the stock only moves on the Manager GA approval.
class InventoryMovementService {
  includes() {
    const db = models.db1;
    const location = (as) => ({
      model: db.InventoryLocation,
      as,
      attributes: ["id", "location_code", "location_name"],
    });
    const inventory = (as) => ({
      model: db.Inventory,
      as,
      attributes: [
        "id",
        "item_name",
        "brand",
        "serial_number",
        "size",
        "material",
        "other",
        "quantity",
        "quantity_unit",
      ],
    });
    return [
      { model: db.Company, as: "company", attributes: ["id", "company_name"] },
      inventory("inventory_source"),
      inventory("inventory_destination"),
      location("inventory_location_source"),
      location("inventory_location_destination"),
      {
        model: db.User,
        as: "user_request",
        attributes: ["id", "name", "email"],
      },
      {
        model: db.InventoryMovementVerificationProgress,
        as: "verification_progress",
        separate: true,
        order: [["createdAt", "ASC"]],
        include: [{ model: db.User, as: "user", attributes: ["id", "name"] }],
      },
    ];
  }

  async getById(id) {
    const row = await models.db1.InventoryMovement.findOne({
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
        await models.db1.InventoryMovement.findAndCountAll(options);
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
    return (await models.db1.InventoryMovement.findAll(options)).map((row) =>
      row.toJSON(),
    );
  }

  async addProgress(id, userId, status, note, t1, t2) {
    await mirrorCreate(
      "InventoryMovementVerificationProgress",
      { id_inventory_movement: id, id_user: userId, status, note: note || null },
      t1,
      t2,
    );
  }

  // Locked source row; fails when it no longer holds quantity.
  async lockSource(id, quantity, t1) {
    const source = await models.db1.Inventory.findByPk(id, {
      include: [
        {
          model: models.db1.File,
          as: "files_product",
          required: false,
          where: { is_active: true },
        },
      ],
      transaction: t1,
      lock: t1.LOCK.UPDATE,
    });
    if (!source) fail("Source inventory not found", 404);
    if (Number(source.quantity) < quantity)
      fail(
        `Insufficient stock: source only has ${Number(source.quantity)} ${source.quantity_unit}`,
        409,
      );
    return source;
  }

  // Stock is checked here and again when it moves, since it can change in between.
  async create(input, userId, isDoubleDatabase = true) {
    const quantity = round2(input.quantity);
    const id = await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const source = await this.lockSource(input.id_inventory_source, quantity, t1);
      if (!source.id_company || !source.id_inventory_location)
        fail("Source inventory has no company or location yet", 409);
      if (Number(input.id_inventory_location_destination) === source.id_inventory_location)
        fail("Destination location must differ from the source location");
      const destination = await models.db1.InventoryLocation.findOne({
        where: { id: input.id_inventory_location_destination, is_active: true },
        attributes: ["id"],
        transaction: t1,
      });
      if (!destination) fail("Destination location not found", 404);
      const company = await models.db1.Company.findByPk(source.id_company, {
        attributes: ["id", "company_name", "initial_company"],
        transaction: t1,
      });
      if (!company?.initial_company?.trim())
        fail(`Company ${company?.company_name ?? source.id_company} has no initial_company`, 409);
      const movement = await mirrorCreate(
        "InventoryMovement",
        {
          movement_no: await nextCompanyNo(
            "InventoryMovement",
            "movement_no",
            "IM",
            company.initial_company.trim(),
            t1,
          ),
          movement_type: input.movement_type,
          id_company: source.id_company,
          id_inventory_source: source.id,
          id_inventory_location_source: source.id_inventory_location,
          id_inventory_location_destination: destination.id,
          item_name: source.item_name,
          quantity_unit: source.quantity_unit,
          quantity,
          reason: input.reason?.trim() || null,
          note: input.note?.trim() || null,
          status: "request spv ga",
          id_user_request: userId,
        },
        t1,
        t2,
      );
      await this.addProgress(
        movement.id,
        userId,
        "request spv ga",
        "Inventory movement created",
        t1,
        t2,
      );
      return movement.id;
    });
    return this.getById(id);
  }

  async lockOpen(id, t1) {
    const movement = await models.db1.InventoryMovement.findOne({
      where: { id, is_active: true },
      transaction: t1,
      lock: t1.LOCK.UPDATE,
    });
    if (!movement) fail("Inventory movement not found", 404);
    if (!nextStatus[movement.status])
      fail(`Inventory movement is already ${movement.status}`, 409);
    return movement;
  }

  // Takes the quantity out of the source row and adds it to the row of the same
  // item, company and destination location (created when there is none). Both
  // rows record the movement type as their movement_status.
  async moveStock(movement, userId, t1, t2) {
    const quantity = Number(movement.quantity);
    const source = await this.lockSource(movement.id_inventory_source, quantity, t1);
    const note = `${movement.movement_type === "stock transfer" ? "Stock transfer" : "Stock allocation"} ${movement.movement_no}`;
    await mirrorUpdate(
      "Inventory",
      source.id,
      {
        quantity: round2(Number(source.quantity) - quantity),
        movement_status: movement.movement_type,
      },
      t1,
      t2,
    );
    await mirrorCreate(
      "InventoryHistory",
      {
        id_inventory: source.id,
        id_inventory_movement: movement.id,
        id_user: userId,
        quantity: -quantity,
        note,
      },
      t1,
      t2,
    );
    const destinationId = await inventoryService.addStock(
      {
        ...source.toJSON(),
        id_inventory_location: movement.id_inventory_location_destination,
        quantity,
      },
      { id_inventory_movement: movement.id, note },
      userId,
      t1,
      t2,
    );
    await mirrorUpdate(
      "Inventory",
      destinationId,
      { movement_status: movement.movement_type },
      t1,
      t2,
    );
    return destinationId;
  }

  async approve(id, userId, note, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const movement = await this.lockOpen(id, t1);
      const approver = approverOf[movement.status];
      const status = nextStatus[movement.status];
      const data = { status };
      if (status === "approved")
        data.id_inventory_destination = await this.moveStock(movement, userId, t1, t2);
      await mirrorUpdate("InventoryMovement", movement.id, data, t1, t2);
      await this.addProgress(movement.id, userId, `approved ${approver}`, note, t1, t2);
    });
    return this.getById(id);
  }

  async reject(id, userId, note, isDoubleDatabase = true) {
    if (!note?.trim()) fail("note is required for rejection");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const movement = await this.lockOpen(id, t1);
      const approver = approverOf[movement.status];
      await mirrorUpdate("InventoryMovement", movement.id, { status: "rejected" }, t1, t2);
      await this.addProgress(movement.id, userId, `rejected ${approver}`, note, t1, t2);
    });
    return this.getById(id);
  }
}

module.exports = new InventoryMovementService();
