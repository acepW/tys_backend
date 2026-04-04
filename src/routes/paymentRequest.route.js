const express = require("express");
const router = express.Router();
const PaymentRequestController = require("../controllers/paymentRequest/paymentRequest.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, PaymentRequestController.getAll);
router.get("/:id", authenticate, PaymentRequestController.getById);

// POST routes
router.post("/", authenticate, PaymentRequestController.create);

// PATCH routes
router.patch("/approve/:id", authenticate, PaymentRequestController.approve);

// PATCH routes
router.patch("/reject/:id", authenticate, PaymentRequestController.reject);

// PATCH routes
router.patch("/paid/:id", authenticate, PaymentRequestController.paid);

// DELETE routes
router.delete("/:id", authenticate, PaymentRequestController.delete);

module.exports = router;
