const express = require("express");
const router = express.Router();
const QuotationController = require("../controllers/quotation.controller");

// GET routes
router.get("/", QuotationController.getAll);
router.get("/:id", QuotationController.getById);

// POST routes
router.post("/", QuotationController.create);

// PUT routes
router.put("/:id", QuotationController.update);

//PATCH payment
router.patch("/payment/:id", QuotationController.syncPayment);

// DELETE routes
router.delete("/:id", QuotationController.delete);

//PATCH approve
router.patch("/approve/:id", QuotationController.approve);

//PATCH reject
router.patch("/reject/:id", QuotationController.reject);

module.exports = router;
