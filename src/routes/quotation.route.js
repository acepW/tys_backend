const express = require("express");
const router = express.Router();
const QuotationController = require("../controllers/quotation.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, QuotationController.getAll);
router.get("/:id", authenticate, QuotationController.getById);

// POST routes
router.post("/", authenticate, QuotationController.create);

// PUT routes
router.put("/:id", authenticate, QuotationController.update);

//PATCH payment
router.patch("/payment/:id", authenticate, QuotationController.syncPayment);

// DELETE routes
router.delete("/:id", authenticate, QuotationController.delete);

//PATCH approve
router.patch("/approve/:id", authenticate, QuotationController.approve);

//PATCH reject
router.patch("/reject/:id", authenticate, QuotationController.reject);

module.exports = router;
