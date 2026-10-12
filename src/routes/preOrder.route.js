const express = require("express");
const router = express.Router();
const PreOrderController = require("../controllers/preOrder/preOrder.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { requireApprover } = require("../middleware/approval.middleware");

// GET routes
router.get("/", authenticate, PreOrderController.getAll);
router.get("/:id", authenticate, PreOrderController.getById);
router.get("/no/documents", authenticate, PreOrderController.getNoPreOrder);

// POST routes
router.post("/", authenticate, PreOrderController.create);

// PUT routes
router.put("/:id", authenticate, PreOrderController.update);

//PATCH payment
router.patch("/payment/:id", authenticate, PreOrderController.syncPayment);

// PATCH open payment
router.patch(
  "/open-payment/:id_payment",
  authenticate,
  PreOrderController.openPayment,
);
// DELETE routes
router.delete("/:id", authenticate, PreOrderController.delete);

//PATCH approve
router.patch("/approve/:id", authenticate, requireApprover("purchase order", ["pending"]), PreOrderController.approve);

//PATCH reject
router.patch("/reject/:id", authenticate, requireApprover("purchase order", ["pending"]), PreOrderController.reject);

module.exports = router;
