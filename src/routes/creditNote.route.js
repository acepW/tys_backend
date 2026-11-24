const express = require("express");
const router = express.Router();
const controller = require("../controllers/creditNote/creditNote.controller");
const { authenticate } = require("../middleware/auth.middleware");

// Credit notes of cancelled paid invoices (docs/invoice-cancellation-paid.md).
// Paying from a deposit: PATCH /invoices/credit-note-payment/:id and
// PATCH /debit-notes/credit-note-payment/:id.
router.get("/deposits", authenticate, controller.deposits);
router.get("/:id", authenticate, controller.getById);

module.exports = router;
