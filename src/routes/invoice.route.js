const express = require("express");
const router = express.Router();
const InvoiceController = require("../controllers/invoice.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, InvoiceController.getAll);
router.get("/:id", authenticate, InvoiceController.getById);

// POST routes
router.post("/", authenticate, InvoiceController.create);

// PUT routes
router.put("/:id", authenticate, InvoiceController.update);

// DELETE routes
router.delete("/:id", authenticate, InvoiceController.delete);

//PATCH approve
router.patch("/approve/:id", authenticate, InvoiceController.approve);

//PATCH reject
router.patch("/reject/:id", authenticate, InvoiceController.reject);

module.exports = router;
