const express = require("express");
const router = express.Router();
const contractController = require("../controllers/contarct.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, contractController.getAll);
router.get("/:id", authenticate, contractController.getById);

// POST routes
router.post("/", authenticate, contractController.create);

// PUT routes
router.put("/:id", authenticate, contractController.update);

// PATCH routes
router.patch("/submit/:id", authenticate, contractController.submit);

// PATCH routes
router.patch("/approve/:id", authenticate, contractController.approve);

// PATCH routes
router.patch("/reject/:id", authenticate, contractController.reject);

// PATCH routes
router.patch(
  "/send-to-customer/:id",
  authenticate,
  contractController.sendToCustomer,
);

// PATCH routes
router.patch(
  "/approve-customer/:id",
  authenticate,
  contractController.approveByCustomer,
);

// PATCH routes
router.patch(
  "/reject-customer/:id",
  authenticate,
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
