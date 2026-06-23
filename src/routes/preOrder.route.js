const express = require("express");
const router = express.Router();
const PreOrderController = require("../controllers/preOrder/preOrder.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

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

// DELETE routes
router.delete("/:id", authenticate, PreOrderController.delete);

//PATCH approve
router.patch("/approve/:id", authenticate, PreOrderController.approve);

//PATCH reject
router.patch("/reject/:id", authenticate, PreOrderController.reject);

module.exports = router;
