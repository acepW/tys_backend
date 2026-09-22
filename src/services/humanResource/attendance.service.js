const { Op } = require("sequelize");
const { models, db1, db2 } = require("../../models");
const {
  parseAttendancePayload,
  summarizeAttendance,
} = require("../../utils/zktecoPush");

class AttendanceService {
  constructor() {
    this.useDoubleDatabase = process.env.ATTENDANCE_DOUBLE_DATABASE !== "false";
    this.autoRegisterDevices =
      process.env.ATTENDANCE_AUTO_REGISTER_DEVICES !== "false";
  }

  async _touchDevice(dbModels, transaction, serialNumber, ipAddress) {
    let device = await dbModels.AttendanceDevice.findOne({
      where: { serial_number: serialNumber },
      transaction,
    });

    if (!device && this.autoRegisterDevices) {
      [device] = await dbModels.AttendanceDevice.findOrCreate({
        where: { serial_number: serialNumber },
        defaults: {
          serial_number: serialNumber,
          name: `ZKTeco ${serialNumber}`,
          timezone_offset: process.env.ATTENDANCE_DEFAULT_TIMEZONE_OFFSET || "+07:00",
          is_auto_registered: true,
          is_active: true,
        },
        transaction,
      });
    }

    if (!device) {
      const error = new Error(`Attendance device not registered: ${serialNumber}`);
      error.statusCode = 403;
      throw error;
    }
    await device.update(
      { last_seen_at: new Date(), last_ip_address: ipAddress || null },
      { transaction },
    );
    if (!device.is_active) {
      const error = new Error(`Attendance device is inactive: ${serialNumber}`);
      error.statusCode = 403;
      throw error;
    }
    return device;
  }

  async registerHeartbeat(serialNumber, ipAddress) {
    let transaction1;
    let transaction2;
    try {
      transaction1 = await db1.transaction();
      const device1 = await this._touchDevice(
        models.db1,
        transaction1,
        serialNumber,
        ipAddress,
      );

      if (this.useDoubleDatabase) {
        transaction2 = await db2.transaction();
        await this._touchDevice(
          models.db2,
          transaction2,
          serialNumber,
          ipAddress,
        );
      }

      await transaction1.commit();
      if (transaction2) await transaction2.commit();
      return device1.toJSON();
    } catch (error) {
      if (transaction1 && !transaction1.finished) await transaction1.rollback();
      if (transaction2 && !transaction2.finished) await transaction2.rollback();
      throw error;
    }
  }

  async _rebuildSummary(dbModels, transaction, employeeId, attendanceDate) {
    const logs = await dbModels.AttendanceLog.findAll({
      where: {
        id_employee: employeeId,
        attendance_date: attendanceDate,
        processing_status: "processed",
      },
      order: [["occurred_at", "ASC"]],
      raw: true,
      transaction,
    });
    if (logs.length === 0) return;

    const summary = summarizeAttendance(logs);
    const existing = await dbModels.Attendance.findOne({
      where: { id_employee: employeeId, attendance_date: attendanceDate },
      transaction,
    });
    if (existing) {
      await existing.update(summary, { transaction });
    } else {
      await dbModels.Attendance.create(
        { id_employee: employeeId, attendance_date: attendanceDate, ...summary },
        { transaction },
      );
    }
  }

  async _ingestIntoDatabase(
    dbModels,
    transaction,
    serialNumber,
    body,
    ipAddress,
  ) {
    const device = await this._touchDevice(
      dbModels,
      transaction,
      serialNumber,
      ipAddress,
    );
    const { events, invalidLines } = parseAttendancePayload(
      body,
      serialNumber,
      device.timezone_offset,
    );
    const userIds = [...new Set(events.map((event) => event.deviceUserId))];
    const employees = userIds.length
      ? await dbModels.Employee.findAll({
          where: { device_user_id: { [Op.in]: userIds }, is_active: true },
          transaction,
        })
      : [];
    const employeesByDeviceId = new Map(
      employees.map((employee) => [employee.device_user_id, employee]),
    );
    const affectedSummaries = new Set();
    let createdCount = 0;
    let duplicateCount = 0;
    let unmatchedCount = 0;

    for (const event of events) {
      const employee = employeesByDeviceId.get(event.deviceUserId) || null;
      const [log, created] = await dbModels.AttendanceLog.findOrCreate({
        where: { event_key: event.eventKey },
        defaults: {
          id_attendance_device: device.id,
          id_employee: employee?.id || null,
          device_user_id: event.deviceUserId,
          attendance_date: event.attendanceDate,
          occurred_at: event.occurredAt,
          punch_state: event.punchState,
          punch_type: event.punchType,
          verify_mode: event.verifyMode,
          work_code: event.workCode,
          event_key: event.eventKey,
          processing_status: employee ? "processed" : "unmatched",
          raw_payload: event.rawPayload,
          received_at: new Date(),
        },
        transaction,
      });

      if (created) createdCount += 1;
      else duplicateCount += 1;
      if (!employee && created) unmatchedCount += 1;
      if (employee) affectedSummaries.add(`${employee.id}|${event.attendanceDate}`);

      // A previously unmatched log may become matchable after employee setup.
      if (!created && employee && !log.id_employee) {
        await log.update(
          { id_employee: employee.id, processing_status: "processed" },
          { transaction },
        );
      }
    }

    for (const key of affectedSummaries) {
      const [employeeId, attendanceDate] = key.split("|");
      await this._rebuildSummary(
        dbModels,
        transaction,
        Number(employeeId),
        attendanceDate,
      );
    }

    return {
      received_count: events.length,
      created_count: createdCount,
      duplicate_count: duplicateCount,
      unmatched_count: unmatchedCount,
      invalid_count: invalidLines.length,
    };
  }

  async ingest(serialNumber, body, ipAddress) {
    let transaction1;
    let transaction2;
    try {
      transaction1 = await db1.transaction();
      const primaryResult = await this._ingestIntoDatabase(
        models.db1,
        transaction1,
        serialNumber,
        body,
        ipAddress,
      );

      if (this.useDoubleDatabase) {
        transaction2 = await db2.transaction();
        await this._ingestIntoDatabase(
          models.db2,
          transaction2,
          serialNumber,
          body,
          ipAddress,
        );
      }

      await transaction1.commit();
      if (transaction2) await transaction2.commit();
      return primaryResult;
    } catch (error) {
      if (transaction1 && !transaction1.finished) await transaction1.rollback();
      if (transaction2 && !transaction2.finished) await transaction2.rollback();
      throw error;
    }
  }

  async reprocessEmployee(employeeId, deviceUserId, isDoubleDatabase = true) {
    const targets = [{ db: db1, models: models.db1 }];
    if (isDoubleDatabase) targets.push({ db: db2, models: models.db2 });
    let total = 0;

    for (const target of targets) {
      const transaction = await target.db.transaction();
      try {
        const logs = await target.models.AttendanceLog.findAll({
          where: {
            device_user_id: deviceUserId,
            id_employee: null,
            processing_status: "unmatched",
          },
          transaction,
        });
        const dates = [...new Set(logs.map((log) => log.attendance_date))];
        if (logs.length > 0) {
          await target.models.AttendanceLog.update(
            { id_employee: employeeId, processing_status: "processed" },
            {
              where: {
                device_user_id: deviceUserId,
                id_employee: null,
                processing_status: "unmatched",
              },
              transaction,
            },
          );
        }
        for (const date of dates) {
          await this._rebuildSummary(
            target.models,
            transaction,
            employeeId,
            date,
          );
        }
        await transaction.commit();
        if (target.models === models.db1) total = logs.length;
      } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        throw error;
      }
    }
    return { processed_count: total };
  }

  async getLogs(filters = {}, page = 1, limit = 20) {
    const where = {};
    if (filters.id_employee) where.id_employee = filters.id_employee;
    if (filters.id_attendance_device) {
      where.id_attendance_device = filters.id_attendance_device;
    }
    if (filters.device_user_id) where.device_user_id = filters.device_user_id;
    if (filters.punch_type) where.punch_type = filters.punch_type;
    if (filters.processing_status) {
      where.processing_status = filters.processing_status;
    }
    if (filters.date_from || filters.date_to) {
      where.attendance_date = {};
      if (filters.date_from) where.attendance_date[Op.gte] = filters.date_from;
      if (filters.date_to) where.attendance_date[Op.lte] = filters.date_to;
    }

    const result = await models.db1.AttendanceLog.findAndCountAll({
      where,
      include: [
        { model: models.db1.Employee, as: "employee", required: false },
        {
          model: models.db1.AttendanceDevice,
          as: "attendance_device",
          required: true,
        },
      ],
      order: [["occurred_at", "DESC"]],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });
    return this._paginated(result, page, limit);
  }

  async getSummaries(filters = {}, page = 1, limit = 20) {
    const where = {};
    if (filters.id_employee) where.id_employee = filters.id_employee;
    if (filters.status) where.status = filters.status;
    if (filters.date_from || filters.date_to) {
      where.attendance_date = {};
      if (filters.date_from) where.attendance_date[Op.gte] = filters.date_from;
      if (filters.date_to) where.attendance_date[Op.lte] = filters.date_to;
    }
    const result = await models.db1.Attendance.findAndCountAll({
      where,
      include: [{ model: models.db1.Employee, as: "employee", required: true }],
      order: [
        ["attendance_date", "DESC"],
        ["id_employee", "ASC"],
      ],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });
    return this._paginated(result, page, limit);
  }

  _paginated(result, page, limit) {
    return {
      data: result.rows.map((row) => row.toJSON()),
      pagination: {
        total: result.count,
        page,
        limit,
        total_pages: Math.ceil(result.count / limit),
      },
    };
  }
}

module.exports = new AttendanceService();
