const attendanceDeviceService = require("../../services/humanResource/attendanceDevice.service");
const { successResponse, errorResponse } = require("../../utils/response");

class AttendanceDeviceController {
  async getAll(req, res) {
    try {
      const devices = await attendanceDeviceService.findAll({
        order: [["name", "ASC"]],
      });
      const now = Date.now();
      const data = devices.map((device) => ({
        ...device,
        connection_status:
          device.last_seen_at && now - new Date(device.last_seen_at).getTime() <= 120000
            ? "online"
            : "offline",
      }));
      return successResponse(res, data, "Attendance devices retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async getById(req, res) {
    try {
      const device = await attendanceDeviceService.findById(req.params.id);
      if (!device) return errorResponse(res, "Attendance device not found", 404);
      return successResponse(res, device, "Attendance device retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async create(req, res) {
    try {
      const { is_double_database = true, serial_number, name, location } =
        req.body || {};
      const timezoneOffset = req.body?.timezone_offset || "+07:00";
      if (!serial_number || !name) {
        return errorResponse(res, "serial_number and name are required", 400);
      }
      if (!/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(timezoneOffset)) {
        return errorResponse(res, "timezone_offset must use format +07:00", 400);
      }
      const normalizedSerial = String(serial_number).trim();
      const existing = await attendanceDeviceService.findOne({
        where: { serial_number: normalizedSerial },
      });
      if (existing) {
        return errorResponse(res, "Attendance device serial number already exists", 409);
      }
      const device = await attendanceDeviceService.create(
        {
          serial_number: normalizedSerial,
          name: String(name).trim(),
          location: location || null,
          timezone_offset: timezoneOffset,
          is_auto_registered: false,
          is_active: true,
        },
        is_double_database !== false,
      );
      return successResponse(res, device, "Attendance device created successfully", 201);
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async update(req, res) {
    try {
      const { is_double_database = true, name, location, timezone_offset, is_active } =
        req.body || {};
      const existing = await attendanceDeviceService.findById(req.params.id);
      if (!existing) return errorResponse(res, "Attendance device not found", 404);
      if (
        timezone_offset !== undefined &&
        !/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(timezone_offset)
      ) {
        return errorResponse(res, "timezone_offset must use format +07:00", 400);
      }
      const data = {};
      if (name !== undefined) data.name = name;
      if (location !== undefined) data.location = location;
      if (timezone_offset !== undefined) data.timezone_offset = timezone_offset;
      if (is_active !== undefined) data.is_active = is_active === true;
      const device = await attendanceDeviceService.update(
        req.params.id,
        data,
        is_double_database !== false,
      );
      return successResponse(res, device, "Attendance device updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async delete(req, res) {
    try {
      const existing = await attendanceDeviceService.findById(req.params.id);
      if (!existing) return errorResponse(res, "Attendance device not found", 404);
      await attendanceDeviceService.update(req.params.id, { is_active: false });
      return successResponse(res, null, "Attendance device deactivated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new AttendanceDeviceController();
