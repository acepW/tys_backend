const { Op, fn, col } = require("sequelize");
const { models, db1, db2 } = require("../../models");
const fileService = require("../file.service");

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

async function withTransactions(isDoubleDatabase, work) {
  let t1;
  let t2;
  try {
    t1 = await db1.transaction();
    if (isDoubleDatabase) t2 = await db2.transaction();
    const result = await work(t1, t2);
    await t1.commit();
    if (t2) await t2.commit();
    return result;
  } catch (error) {
    if (t1 && !t1.finished) await t1.rollback();
    if (t2 && !t2.finished) await t2.rollback();
    throw error;
  }
}

async function mirrorCreate(modelName, data, t1, t2) {
  const row = await models.db1[modelName].create(data, { transaction: t1 });
  if (t2)
    await models.db2[modelName].create(
      { ...data, id: row.id },
      { transaction: t2 },
    );
  return row;
}

async function mirrorUpdate(modelName, id, data, t1, t2) {
  await models.db1[modelName].update(data, { where: { id }, transaction: t1 });
  if (t2) {
    const [updated] = await models.db2[modelName].update(data, {
      where: { id },
      transaction: t2,
    });
    if (
      !updated &&
      !(await models.db2[modelName].findByPk(id, { transaction: t2 }))
    ) {
      fail(`${modelName} ${id} missing from second database`, 409);
    }
  }
}

async function mirrorDestroy(modelName, id, t1, t2) {
  await models.db1[modelName].destroy({ where: { id }, transaction: t1 });
  if (t2)
    await models.db2[modelName].destroy({ where: { id }, transaction: t2 });
}

async function syncFiles(type, id, category, files, userId, t1, t2) {
  if (files === undefined) return;
  if (!Array.isArray(files)) fail(`${category} must be an array`);
  await fileService.syncFiles(
    type,
    id,
    files,
    {
      category,
      uploadedBy: userId,
      isDoubleDatabase: !!t2,
      hardDelete: false,
    },
    t1,
    t2,
  );
}

async function deactivateFiles(type, id, t1, t2) {
  const where = { fileable_type: type, fileable_id: id };
  await models.db1.File.update(
    { is_active: false },
    { where, transaction: t1 },
  );
  if (t2)
    await models.db2.File.update(
      { is_active: false },
      { where, transaction: t2 },
    );
}

async function documentNumbers(modelName, prefix, isDoubleDatabase = true) {
  // Single-database writes also target DB1, so numbering always reads DB1.
  const dbModels = models.db1;
  const year = new Date().getFullYear();
  const totals = await dbModels[modelName].findAll({
    attributes: ["id_company", [fn("COUNT", col("id")), "total"]],
    where: {
      createdAt: {
        [Op.gte]: new Date(year, 0, 1),
        [Op.lt]: new Date(year + 1, 0, 1),
      },
    },
    group: ["id_company"],
    raw: true,
  });
  const companies = await dbModels.Company.findAll({
    attributes: ["id", "company_name", "initial_company"],
    raw: true,
  });
  return companies.map((company) => {
    const total = Number(
      totals.find((row) => Number(row.id_company) === Number(company.id))
        ?.total || 0,
    );
    const nextNumber = String(total + 1).padStart(5, "0");
    const code = company.initial_company?.toUpperCase() || "-";
    return {
      id_company: company.id,
      company_name: company.company_name,
      initial_company: code,
      total,
      next_number: nextNumber,
      document_no: `${prefix}-${code}-${year}-${nextNumber}`,
    };
  });
}

module.exports = {
  models,
  Op,
  fail,
  withTransactions,
  mirrorCreate,
  mirrorUpdate,
  mirrorDestroy,
  syncFiles,
  deactivateFiles,
  documentNumbers,
};
