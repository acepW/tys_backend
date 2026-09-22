const { Op } = require("sequelize");
const DualDatabaseService = require("../dualDatabase.service");
const { generateWeekendHolidays } = require("../../utils/holidayCalendar");

class HolidayService extends DualDatabaseService {
  constructor() {
    super("Holiday");
  }

  async getAll(filters = {}) {
    const where = {};

    if (filters.year) {
      where.holiday_date = {
        [Op.between]: [`${filters.year}-01-01`, `${filters.year}-12-31`],
      };
    } else if (filters.date_from || filters.date_to) {
      where.holiday_date = {};
      if (filters.date_from) where.holiday_date[Op.gte] = filters.date_from;
      if (filters.date_to) where.holiday_date[Op.lte] = filters.date_to;
    }

    return this.findAll({ where, order: [["holiday_date", "ASC"]] });
  }

  async createHoliday(data, isDoubleDatabase = true) {
    if (isDoubleDatabase) return this.create(data, true);

    const created = await this.Model1.create(data);
    return created.toJSON();
  }

  async generateYear(year, isDoubleDatabase = true) {
    const weekends = generateWeekendHolidays(year);
    const holidayDates = weekends.map((item) => item.holiday_date);
    const existing = await this.Model1.findAll({
      attributes: ["holiday_date"],
      where: { holiday_date: { [Op.in]: holidayDates } },
      raw: true,
    });
    const existingDates = new Set(existing.map((item) => item.holiday_date));
    const newHolidays = weekends.filter(
      (item) => !existingDates.has(item.holiday_date),
    );

    const created = newHolidays.length
      ? await this.bulkCreate(newHolidays, isDoubleDatabase)
      : [];

    return {
      year,
      weekend_count: weekends.length,
      created_count: created.length,
      skipped_count: weekends.length - created.length,
      holidays: created,
    };
  }
}

module.exports = new HolidayService();
