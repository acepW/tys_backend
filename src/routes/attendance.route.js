const express = require("express");
const router = express.Router();
const controller = require("../controllers/humanResource/attendance.controller");
const { authenticate } = require("../middleware/auth.middleware");

router.get("/logs", authenticate, controller.getLogs);
router.get("/", authenticate, controller.getSummaries);
router.post(
  "/reprocess/:employee_id",
  authenticate,
  controller.reprocessEmployee,
);

module.exports = router;
