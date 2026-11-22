const {
  models,
  Op,
  fail,
  withTransactions,
  mirrorCreate,
  mirrorUpdate,
} = require("../procurement/shared");

const ITEM_CODE_PATTERN = /^[A-Z0-9]{2,10}$/;

// item_code is stored uppercase; only the fields that were sent are returned.
function pick(input) {
  const data = {};
  if (input.item_code !== undefined)
    data.item_code = String(input.item_code).trim().toUpperCase();
  if (input.item_name !== undefined)
    data.item_name = String(input.item_name).trim();
  return data;
}

// Master of goods (kode dan nama barang). Deleting only deactivates.
class MasterItemService {
  async getById(id) {
    const row = await models.db1.MasterItem.findOne({
      where: { id, is_active: true },
    });
    return row?.toJSON() || null;
  }

  async getAll(search, page, limit) {
    const where = { is_active: true };
    if (search)
      where[Op.or] = [
        { item_code: { [Op.like]: `%${search}%` } },
        { item_name: { [Op.like]: `%${search}%` } },
      ];
    const options = { where, order: [["item_code", "ASC"]] };
    if (page && limit) {
      options.limit = limit;
      options.offset = (page - 1) * limit;
      const { count, rows } =
        await models.db1.MasterItem.findAndCountAll(options);
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
    return (await models.db1.MasterItem.findAll(options)).map((row) =>
      row.toJSON(),
    );
  }

  // item_code is unique across every row, including deactivated ones, so a
  // product code prefix never points at two items.
  async checkCode(code, excludeId, t1) {
    if (!ITEM_CODE_PATTERN.test(code))
      fail("item_code must be 2-10 uppercase letters or digits");
    const where = { item_code: code };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    const existing = await models.db1.MasterItem.findOne({
      where,
      transaction: t1,
    });
    if (existing) fail(`item_code ${code} already exists`, 409);
  }

  async create(input, isDoubleDatabase = true) {
    const data = pick(input);
    const id = await withTransactions(isDoubleDatabase, async (t1, t2) => {
      await this.checkCode(data.item_code, null, t1);
      const row = await mirrorCreate(
        "MasterItem",
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
      const current = await this.getById(id);
      if (!current) fail("Master item not found", 404);
      if (data.item_code !== undefined && data.item_code !== current.item_code) {
        // The code is the prefix of product codes, so it is fixed once used.
        const used = await models.db1.PurchaseRequestItem.count({
          where: { id_master_item: id },
          transaction: t1,
        });
        if (used)
          fail("item_code cannot be changed once the master item is used by a purchase request", 409);
        await this.checkCode(data.item_code, id, t1);
      }
      await mirrorUpdate("MasterItem", id, data, t1, t2);
    });
    return this.getById(id);
  }

  async remove(id, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      if (!(await this.getById(id))) fail("Master item not found", 404);
      await mirrorUpdate("MasterItem", id, { is_active: false }, t1, t2);
    });
  }
}

module.exports = new MasterItemService();
