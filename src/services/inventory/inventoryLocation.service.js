const {
  models,
  Op,
  fail,
  withTransactions,
  mirrorCreate,
  mirrorUpdate,
} = require("../procurement/shared");

const fields = ["location_code", "location_name"];

function pick(input) {
  return Object.fromEntries(
    fields
      .filter((field) => input[field] !== undefined)
      .map((field) => [field, String(input[field]).trim()]),
  );
}

// Master of inventory locations (kode dan nama lokasi). Deleting only deactivates.
class InventoryLocationService {
  async getById(id) {
    const row = await models.db1.InventoryLocation.findOne({
      where: { id, is_active: true },
    });
    return row?.toJSON() || null;
  }

  async getAll(search, page, limit) {
    const where = { is_active: true };
    if (search)
      where[Op.or] = [
        { location_code: { [Op.like]: `%${search}%` } },
        { location_name: { [Op.like]: `%${search}%` } },
      ];
    const options = { where, order: [["location_code", "ASC"]] };
    if (page && limit) {
      options.limit = limit;
      options.offset = (page - 1) * limit;
      const { count, rows } =
        await models.db1.InventoryLocation.findAndCountAll(options);
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
    return (await models.db1.InventoryLocation.findAll(options)).map((row) =>
      row.toJSON(),
    );
  }

  // location_code is unique across every row, including deactivated ones.
  async checkCode(code, excludeId, t1) {
    const where = { location_code: code };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    const existing = await models.db1.InventoryLocation.findOne({
      where,
      transaction: t1,
    });
    if (existing) fail(`location_code ${code} already exists`, 409);
  }

  async create(input, isDoubleDatabase = true) {
    const data = pick(input);
    const id = await withTransactions(isDoubleDatabase, async (t1, t2) => {
      await this.checkCode(data.location_code, null, t1);
      const row = await mirrorCreate(
        "InventoryLocation",
        { ...data, is_active: true },
        t1,
        t2,
      );
      return row.id;
    });
    return this.getById(id);
  }

  async update(id, input, isDoubleDatabase = true) {
    const data = pick(input);
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      if (!(await this.getById(id))) fail("Inventory location not found", 404);
      if (data.location_code) await this.checkCode(data.location_code, id, t1);
      await mirrorUpdate("InventoryLocation", id, data, t1, t2);
    });
    return this.getById(id);
  }

  // A location still set as a company's default cannot be removed, since GA
  // purchase order stock for that company would have nowhere to go.
  async remove(id, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      if (!(await this.getById(id))) fail("Inventory location not found", 404);
      const companies = await models.db1.Company.count({
        where: { id_inventory_location: id, is_active: true },
        transaction: t1,
      });
      if (companies)
        fail(
          `Inventory location is the default location of ${companies} company(ies)`,
          409,
        );
      await mirrorUpdate("InventoryLocation", id, { is_active: false }, t1, t2);
    });
  }
}

module.exports = new InventoryLocationService();
