const express = require("express");
const router = express.Router();
const ServicePriceController = require("../controllers/servicePricing.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, ServicePriceController.getAll);
router.get("/:id", authenticate, ServicePriceController.getById);

// POST routes
router.post("/", authenticate, ServicePriceController.create);

// PUT routes
router.put("/:id", authenticate, ServicePriceController.update);

// DELETE routes
router.delete("/:id", authenticate, ServicePriceController.delete);

//PATCH approve
router.patch("/approve/:id", authenticate, ServicePriceController.approve);

//PATCH reject
router.patch("/reject/:id", authenticate, ServicePriceController.reject);

module.exports = router;
