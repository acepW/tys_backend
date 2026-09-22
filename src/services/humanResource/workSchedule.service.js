const { Op } = require("sequelize");
const DualDatabaseService = require("../dualDatabase.service");
const { models, db1, db2 } = require("../../models");
const { previousDate } = require("../../utils/workSchedule");

class WorkScheduleService extends DualDatabaseService {
  constructor() {
    super("WorkSchedule");
  }

  async getAll(filters = {}) {
    const where = {};
    if (filters.is_active !== undefined) where.is_active = filters.is_active;

    return this.findAll({
      where,
      order: [["effective_start_date", "DESC"]],
    });
  }

  async getCurrent(date) {
    return this.findOne({
      where: {
        is_default: true,
        is_active: true,
        effective_start_date: { [Op.lte]: date },
        [Op.or]: [
          { effective_end_date: null },
          { effective_end_date: { [Op.gte]: date } },
        ],
      },
      order: [["effective_start_date", "DESC"]],
    });
  }

  async createVersion(data, isDoubleDatabase = true) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      transaction1 = await db1.transaction();
      if (isDoubleDatabase) transaction2 = await db2.transaction();

      const duplicateStart = await models.db1.WorkSchedule.findOne({
        where: {
          is_default: true,
          effective_start_date: data.effective_start_date,
        },
        transaction: transaction1,
        lock: transaction1.LOCK.UPDATE,
      });
      if (duplicateStart) {
        const error = new Error(
          "A default work schedule already starts on this date",
        );
        error.statusCode = 409;
        throw error;
      }

      const previous = await models.db1.WorkSchedule.findOne({
        where: {
          is_default: true,
          effective_start_date: { [Op.lt]: data.effective_start_date },
        },
        order: [["effective_start_date", "DESC"]],
        transaction: transaction1,
        lock: transaction1.LOCK.UPDATE,
      });
      const next = await models.db1.WorkSchedule.findOne({
        where: {
          is_default: true,
          effective_start_date: { [Op.gt]: data.effective_start_date },
        },
        order: [["effective_start_date", "ASC"]],
        transaction: transaction1,
        lock: transaction1.LOCK.UPDATE,
      });

      if (previous) {
        const previousEndDate = previousDate(data.effective_start_date);
        await models.db1.WorkSchedule.update(
          { effective_end_date: previousEndDate },
          { where: { id: previous.id }, transaction: transaction1 },
        );
        if (isDoubleDatabase) {
          await models.db2.WorkSchedule.update(
            { effective_end_date: previousEndDate },
            { where: { id: previous.id }, transaction: transaction2 },
          );
        }
      }

      const payload = {
        ...data,
        effective_end_date: next
          ? previousDate(next.effective_start_date)
          : null,
        is_default: true,
        is_active: true,
      };
      const created = await models.db1.WorkSchedule.create(payload, {
        transaction: transaction1,
      });
      if (isDoubleDatabase) {
        await models.db2.WorkSchedule.create(
          { ...payload, id: created.id },
          { transaction: transaction2 },
        );
      }

      await transaction1.commit();
      if (transaction2) await transaction2.commit();
      return created.toJSON();
    } catch (error) {
      if (transaction1 && !transaction1.finished) await transaction1.rollback();
      if (transaction2 && !transaction2.finished) await transaction2.rollback();
      throw error;
    }
  }
}

module.exports = new WorkScheduleService();
