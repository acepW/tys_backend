const express = require("express");
const router = express.Router();
const PaymentRequestController = require("../controllers/paymentRequest/paymentRequest.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { requireApprover } = require("../middleware/approval.middleware");

const PAYMENT_REQUEST_APPROVAL_STATUSES = [
  "pending",
  "approve dept manager",
  "approve fat",
  "approve manager fat",
  "approve director",
];

// GET routes
router.get("/", authenticate, PaymentRequestController.getAll);
router.get("/no/documents", authenticate, PaymentRequestController.getNoPaymentRequest);
router.get("/:id", authenticate, PaymentRequestController.getById);

// POST routes
router.post("/", authenticate, PaymentRequestController.create);
router.post("/expenses", authenticate, PaymentRequestController.createExpense);

// Update each form through its own endpoint.
router.put("/:id", authenticate, PaymentRequestController.update);
router.put("/:id/expenses", authenticate, PaymentRequestController.updateExpense);

// PUT file list
router.put("/:id/files", authenticate, PaymentRequestController.updateFiles);

// PATCH routes
router.patch("/approve/:id", authenticate, requireApprover("payment request", PAYMENT_REQUEST_APPROVAL_STATUSES), PaymentRequestController.approve);

// PATCH routes
router.patch("/reject/:id", authenticate, requireApprover("payment request", PAYMENT_REQUEST_APPROVAL_STATUSES), PaymentRequestController.reject);

// PATCH routes
router.patch("/paid/:id", authenticate, requireApprover("payment request", ["approve cashier"]), PaymentRequestController.paid);

// DELETE routes
router.delete("/:id", authenticate, PaymentRequestController.delete);

module.exports = router;
