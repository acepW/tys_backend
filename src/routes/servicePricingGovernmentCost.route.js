const express = require("express");
const router = express.Router();
const ServicePriceGovernmentCostController = require("../controllers/servicePricing/servicePricingGovernmentCost.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, ServicePriceGovernmentCostController.getAll);

module.exports = router;
