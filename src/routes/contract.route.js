const express = require("express");
const router = express.Router();
const contractController = require("../controllers/contract/contarct.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { requireApprover } = require("../middleware/approval.middleware");

// GET routes
router.get("/", authenticate, contractController.getAll);
router.get("/:id", authenticate, contractController.getById);
router.get("/no/documents", authenticate, contractController.getNoContract);

// POST routes
router.post("/", authenticate, contractController.create);

// PUT routes
router.put("/:id", authenticate, contractController.update);

// PATCH routes
router.patch("/submit/:id", authenticate, requireApprover("contract", ["pending"]), contractController.submit);

// PATCH routes
router.patch("/approve/:id", authenticate, requireApprover("contract", ["on verification"]), contractController.approve);

// PATCH routes
router.patch("/reject/:id", authenticate, requireApprover("contract", ["on verification"]), contractController.reject);

// PATCH routes
router.patch(
  "/send-to-customer/:id",
  authenticate,
  requireApprover("contract", ["approved"]),
  contractController.sendToCustomer,
);

// PATCH routes
router.patch(
  "/approve-customer/:id",
  authenticate,
  requireApprover("contract", ["sending to customer"]),
  contractController.approveByCustomer,
);

// PATCH routes
router.patch(
  "/reject-customer/:id",
  authenticate,
  requireApprover("contract", ["sending to customer"]),
  contractController.rejectByCustomer,
);

// PATCH routes
router.patch(
  "/open-payment/:id_payment",
  authenticate,
  contractController.openPayment,
);

// DELETE routes
router.delete("/:id", authenticate, contractController.delete);

module.exports = router;
