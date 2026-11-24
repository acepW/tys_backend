const express = require("express");
const router = express.Router();
const controller = require("../controllers/report/reportCreditNote.controller");
const { authenticate } = require("../middleware/auth.middleware");

// Credit note reports (docs/invoice-cancellation-paid.md R13)
router.get("/balances", authenticate, controller.balances);
router.get("/ledger", authenticate, controller.ledger);
router.get("/", authenticate, controller.list);
router.get("/:id", authenticate, controller.detail);

module.exports = router;
