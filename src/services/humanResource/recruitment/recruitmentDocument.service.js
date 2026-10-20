const {
  models,
  fail,
  withTransactions,
  mirrorCreate,
  mirrorUpdate,
  syncFiles,
} = require("../../procurement/shared");
const { isValidDateOnly } = require("../../../utils/holidayCalendar");

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

// Field checks shared by the module configs; each throws a 400 on bad input.
const check = {
  required(data, key) {
    if (data[key] == null || String(data[key]).trim() === "") fail(`${key} is required`);
  },
  date(data, key) {
    if (data[key] != null && data[key] !== "" && !isValidDateOnly(data[key]))
      fail(`${key} must use YYYY-MM-DD format`);
  },
  time(data, key) {
    if (data[key] != null && data[key] !== "" && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(data[key]))
      fail(`${key} must use HH:MM format`);
  },
  id(data, key) {
    if (data[key] == null || data[key] === "") return;
    const id = Number(data[key]);
    if (!Number.isInteger(id) || id <= 0) fail(`${key} must be a positive integer`);
  },
  amount(data, key) {
    if (data[key] == null || data[key] === "") return;
    const amount = Number(data[key]);
    if (!Number.isFinite(amount) || amount < 0) fail(`${key} must be a non-negative number`);
  },
  oneOf(data, key, values) {
    if (!values.includes(data[key])) fail(`${key} must be one of: ${values.join(", ")}`);
  },
};

// Empty strings from forms are stored as NULL.
const blankToNull = (data) =>
  Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === "" ? null : value]));

/**
 * One recruitment module: a document created as "pending", edited while pending
 * (or always, with editableStatuses null) and approved or rejected once.
 * config:
 *   module        name stored in recruitment_verification_progress.module
 *   modelName     Sequelize model
 *   label         used in error messages
 *   fields        columns accepted from the request body
 *   createOnly    fields accepted on create but not on edit
 *   fileableType, fileCategories   file arrays synced from the body
 *   includes()    extra includes for list/detail
 *   prepare(data, existing, t1)    validates and completes data before it is saved
 *   afterSave(doc, input, userId, t1, t2)   side effects after create/edit
 *   editableStatuses   statuses that may be edited (null = any)
 */
class RecruitmentDocumentService {
  constructor(config) {
    this.config = { createOnly: [], fileCategories: [], editableStatuses: ["pending"], ...config };
  }

  get model() {
    return models.db1[this.config.modelName];
  }

  includes() {
    const db = models.db1;
    return [
      { model: db.User, as: "user_request", attributes: ["id", "name", "email"] },
      ...this.config.fileCategories.map((category) => ({
        model: db.File,
        as: category,
        required: false,
        where: { is_active: true },
      })),
      ...(this.config.includes?.() || []),
    ];
  }

  async getById(id) {
    const row = await this.model.findOne({
      where: { id, is_active: true },
      include: this.includes(),
    });
    if (!row) return null;
    const progress = await models.db1.RecruitmentVerificationProgress.findAll({
      where: { module: this.config.module, id_document: row.id },
      include: [{ model: models.db1.User, as: "user", attributes: ["id", "name"] }],
      order: [["createdAt", "ASC"]],
    });
    return { ...row.toJSON(), verification_progress: progress.map((item) => item.toJSON()) };
  }

  async getAll(where = {}, page, limit) {
    return findPage(
      this.model,
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

  pick(input, isCreate) {
    const keys = isCreate ? [...this.config.fields, ...this.config.createOnly] : this.config.fields;
    return blankToNull(
      Object.fromEntries(keys.filter((key) => input[key] !== undefined).map((key) => [key, input[key]])),
    );
  }

  async addProgress(id, userId, status, note, t1, t2) {
    await mirrorCreate(
      "RecruitmentVerificationProgress",
      { module: this.config.module, id_document: id, id_user: userId, status, note: note || null },
      t1,
      t2,
    );
  }

  async syncAllFiles(id, input, userId, t1, t2) {
    for (const category of this.config.fileCategories)
      await syncFiles(this.config.fileableType, id, category, input[category], userId, t1, t2);
  }

  async lock(id, t1) {
    const doc = await this.model.findOne({
      where: { id, is_active: true },
      transaction: t1,
      lock: t1.LOCK.UPDATE,
    });
    if (!doc) fail(`${this.config.label} not found`, 404);
    return doc;
  }

  async create(input, userId, isDoubleDatabase = true) {
    const id = await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const data = await this.config.prepare(this.pick(input, true), null, t1);
      const doc = await mirrorCreate(
        this.config.modelName,
        { ...data, id_user_request: userId, status: "pending" },
        t1,
        t2,
      );
      await this.syncAllFiles(doc.id, input, userId, t1, t2);
      await this.config.afterSave?.({ ...data, id: doc.id }, input, userId, t1, t2);
      await this.addProgress(doc.id, userId, "created", `${this.config.label} created`, t1, t2);
      return doc.id;
    });
    return this.getById(id);
  }

  async update(id, input, userId, isDoubleDatabase = true) {
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const existing = await this.lock(id, t1);
      const { editableStatuses } = this.config;
      if (editableStatuses && !editableStatuses.includes(existing.status))
        fail(`${this.config.label} cannot be edited while it is ${existing.status}`, 409);
      const data = await this.config.prepare(this.pick(input, false), existing, t1);
      await mirrorUpdate(this.config.modelName, existing.id, data, t1, t2);
      await this.syncAllFiles(existing.id, input, userId, t1, t2);
      await this.config.afterSave?.(
        { ...existing.toJSON(), ...data },
        input,
        userId,
        t1,
        t2,
        existing,
      );
      await this.addProgress(existing.id, userId, "edited", `${this.config.label} edited`, t1, t2);
    });
    return this.getById(id);
  }

  // decision: "approve" or "reject"; a rejection needs a note. Only pending documents.
  async decide(id, decision, userId, note, isDoubleDatabase = true) {
    if (!["approve", "reject"].includes(decision)) fail("Invalid decision");
    if (decision === "reject" && !note?.trim()) fail("note is required for rejection");
    await withTransactions(isDoubleDatabase, async (t1, t2) => {
      const doc = await this.lock(id, t1);
      if (doc.status !== "pending")
        fail(`${this.config.label} is already ${doc.status}`, 409);
      await mirrorUpdate(this.config.modelName, doc.id, { status: decision }, t1, t2);
      await this.addProgress(doc.id, userId, decision, note, t1, t2);
    });
    return this.getById(id);
  }
}

module.exports = { RecruitmentDocumentService, check, findPage };
