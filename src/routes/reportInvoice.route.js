const express = require("express");
const router = express.Router();
const reportInvoiceController = require("../controllers/report/reportInvoice.controller");

// GET routes
router.get("/", reportInvoiceController.getAll);

module.exports = router;
