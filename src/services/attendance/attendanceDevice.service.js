const DualDatabaseService = require("../dualDatabase.service");

class AttendanceDeviceService extends DualDatabaseService {
  constructor() {
    super("AttendanceDevice");
  }
}

module.exports = new AttendanceDeviceService();
