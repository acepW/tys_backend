const express = require("express");
const router = express.Router();
const reportInvoiceController = require("../controllers/report/reportInvoice.controller");
const { authenticate } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, reportInvoiceController.getAll);

module.exports = router;
