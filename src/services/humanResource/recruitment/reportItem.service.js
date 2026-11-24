// Master of the interview report form (docs/recruitment-interview-requirement.md,
// fase H-B). HR adds, edits and deactivates items; the HR and user interviews
// rate every active item (H7, H8).
const { Op } = require("sequelize");
const {
  models,
  fail,
  withTransactions,
  mirrorCreate,
  mirrorUpdate,
} = require("../../procurement/shared");
const { REPORT_SCALE } = require("../../../models/humanResource/recruitment/recruitmentReportItem.model");

const text = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const clean = String(value).replace(/\s+/g, " ").trim();
  return clean || null;
};
const plain = (row) => (row?.toJSON ? row.toJSON() : row);
const order = [["sort_order", "ASC"], ["id", "ASC"]];

class ReportItemService {
  /** Items in form order; inactive ones too with includeInactive. */
  async list({ includeInactive = false } = {}) {
    const where = includeInactive ? {} : { is_active: true };
    return (await models.db1.RecruitmentReportItem.findAll({ where, order })).map(plain);
  }

  /**
   * The form to render: the rating scale and the active items grouped by section,
   * then by group (null group = items without one), in sort_order.
   */
  async form() {
    const sections = [];
    for (const item of await this.list()) {
      let section = sections.at(-1);
      if (section?.name !== item.section) sections.push((section = { name: item.section, groups: [] }));
      let group = section.groups.at(-1);
      if (!group || group.name !== item.group_name)
        section.groups.push((group = { name: item.group_name, description: item.group_description, items: [] }));
      group.items.push({
        id: item.id,
        name: item.item_name,
        description: item.item_description,
        is_optional: item.is_optional,
      });
    }
    return { scale: REPORT_SCALE, sections };
  }

  // Body fields to columns; on create the section and item name are required.
  _data(body, existing = null) {
    const data = {};
    for (const [field, column] of [
      ["section", "section"],
      ["group_name", "group_name"],
      ["group_description", "group_description"],
      ["item_name", "item_name"],
      ["item_description", "item_description"],
    ]) {
      const value = text(body[field]);
      if (value !== undefined) data[column] = value;
    }
    for (const field of ["section", "item_name"])
      if ((!existing || data[field] !== undefined) && !data[field]) fail(`${field} is required`);
    if (body.is_optional !== undefined) {
      if (typeof body.is_optional !== "boolean") fail("is_optional must be true or false");
      data.is_optional = body.is_optional;
    }
    if (body.sort_order !== undefined && body.sort_order !== null && body.sort_order !== "") {
      const sortOrder = Number(body.sort_order);
      if (!Number.isInteger(sortOrder) || sortOrder < 0) fail("sort_order must be a whole number of 0 or more");
      data.sort_order = sortOrder;
    }
    if (body.is_active !== undefined) {
      if (typeof body.is_active !== "boolean") fail("is_active must be true or false");
      data.is_active = body.is_active;
    }
    return data;
  }

  // The same item name may appear once per section and group among active items.
  async _assertUnique(data, excludeId, t1) {
    const where = {
      section: data.section,
      group_name: data.group_name ?? null,
      item_name: data.item_name,
      is_active: true,
    };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    if (await models.db1.RecruitmentReportItem.count({ where, transaction: t1 }))
      fail("The item already exists in this section and group");
  }

  async create(body, isDoubleDatabase = true) {
    const data = this._data(body);
    const id = await withTransactions(isDoubleDatabase, async (t1, t2) => {
      await this._assertUnique(data, null, t1);
      // Without sort_order the item goes last.
      if (data.sort_order === undefined)
        data.sort_order = (Number(await models.db1.RecruitmentReportItem.max("sort_order", { transaction: t1 })) || 0) + 10;
      const row = await mirrorCreate("RecruitmentReportItem", { is_optional: false, is_active: true, ...data }, t1, t2);
      return row.id;
    });
    return this.getById(id);
  }

  async update(id, body, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const existing = await models.db1.RecruitmentReportItem.findByPk(id, { transaction: t1, lock: t1.LOCK.UPDATE });
      if (!existing) fail("Report item not found", 404);
      const data = this._data(body, existing);
      const next = { ...plain(existing), ...data };
      if (next.is_active) await this._assertUnique(next, existing.id, t1);
      await mirrorUpdate("RecruitmentReportItem", existing.id, data, t1, t2);
    });
    return this.getById(id);
  }

  /** Deactivates the item: new reports no longer show it; past reports keep their copy. */
  async deactivate(id, isDoubleDatabase = true) {
    return this.update(id, { is_active: false }, isDoubleDatabase);
  }

  async getById(id) {
    const row = await models.db1.RecruitmentReportItem.findByPk(id);
    if (!row) fail("Report item not found", 404);
    return plain(row);
  }

  /**
   * Checks a filled report against the active master (H8) and returns the score
   * rows to store, with a copy of each item's names: every active item may be
   * rated once; required items need a score, optional ones may be null.
   * @param {Array} scores - [{ id_report_item, score }]
   */
  async buildScores(scores, t1) {
    if (!Array.isArray(scores)) fail("scores must be an array of { id_report_item, score }");
    const items = await models.db1.RecruitmentReportItem.findAll({ where: { is_active: true }, order, transaction: t1 });
    const byId = new Map(items.map((item) => [item.id, plain(item)]));
    const values = REPORT_SCALE.map((option) => option.value);
    const given = new Map();
    scores.forEach((entry, index) => {
      const id = Number(entry?.id_report_item);
      if (!byId.has(id)) fail(`scores[${index}].id_report_item is not an active report item`);
      if (given.has(id)) fail(`scores[${index}] rates item ${id} twice`);
      const score = entry.score === "" || entry.score === undefined ? null : entry.score;
      if (score !== null && !values.includes(score)) fail(`scores[${index}].score must be one of: ${values.join(", ")}`);
      given.set(id, score);
    });
    const missing = items.filter((item) => !item.is_optional && !given.get(item.id));
    if (missing.length) fail(`Every required report item needs a score: ${missing.map((item) => item.item_name).join(", ")}`);
    return items.map((item) => ({
      id_report_item: item.id,
      section: item.section,
      group_name: item.group_name,
      item_name: item.item_name,
      is_optional: item.is_optional,
      sort_order: item.sort_order,
      score: given.get(item.id) ?? null,
    }));
  }
}

module.exports = new ReportItemService();
