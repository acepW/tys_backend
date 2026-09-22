const attendanceService = require("../../services/humanResource/attendance.service");

const getSerialNumber = (req) =>
  String(req.query.SN || req.query.sn || "").trim();

const sendText = (res, status, text) =>
  res.status(status).type("text/plain").send(text);

class ZktecoProtocolController {
  async initialize(req, res) {
    try {
      const serialNumber = getSerialNumber(req);
      if (!serialNumber) return sendText(res, 400, "ERROR: SN is required");
      await attendanceService.registerHeartbeat(serialNumber, req.ip);
      return sendText(
        res,
        200,
        [
          `GET OPTION FROM: ${serialNumber}`,
          "Stamp=0",
          "OpStamp=0",
          "PhotoStamp=0",
          "ErrorDelay=30",
          "Delay=10",
          "TransTimes=00:00;14:05",
          "TransInterval=1",
          "TransFlag=1111000000",
          "Realtime=1",
          "Encrypt=0",
        ].join("\n"),
      );
    } catch (error) {
      return sendText(res, error.statusCode || 500, `ERROR: ${error.message}`);
    }
  }

  async receiveData(req, res) {
    try {
      console.log(req);
      const serialNumber = getSerialNumber(req);
      if (!serialNumber) return sendText(res, 400, "ERROR: SN is required");
      const table = String(req.query.table || "ATTLOG").toUpperCase();
      if (table !== "ATTLOG") {
        await attendanceService.registerHeartbeat(serialNumber, req.ip);
        return sendText(res, 200, "OK");
      }
      const result = await attendanceService.ingest(
        serialNumber,
        req.body,
        req.ip,
      );
      if (result.invalid_count > 0 && result.received_count === 0) {
        return sendText(res, 400, "ERROR: invalid ATTLOG payload");
      }
      return sendText(res, 200, `OK: ${result.received_count}`);
    } catch (error) {
      return sendText(res, error.statusCode || 500, `ERROR: ${error.message}`);
    }
  }

  async getRequest(req, res) {
    try {
      const serialNumber = getSerialNumber(req);
      if (!serialNumber) return sendText(res, 400, "ERROR: SN is required");
      await attendanceService.registerHeartbeat(serialNumber, req.ip);
      return sendText(res, 200, "OK");
    } catch (error) {
      return sendText(res, error.statusCode || 500, `ERROR: ${error.message}`);
    }
  }

  async acknowledgeCommand(req, res) {
    try {
      const serialNumber = getSerialNumber(req);
      if (!serialNumber) return sendText(res, 400, "ERROR: SN is required");
      await attendanceService.registerHeartbeat(serialNumber, req.ip);
      return sendText(res, 200, "OK");
    } catch (error) {
      return sendText(res, error.statusCode || 500, `ERROR: ${error.message}`);
    }
  }
}

module.exports = new ZktecoProtocolController();
