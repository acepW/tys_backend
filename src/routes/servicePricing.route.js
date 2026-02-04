const express = require("express");
const router = express.Router();
const ServicePriceController = require("../controllers/servicePricing.controller");

// GET routes
router.get("/", ServicePriceController.getAll);
router.get("/:id", ServicePriceController.getById);

// POST routes
router.post("/", ServicePriceController.create);

// PUT routes
router.put("/:id", ServicePriceController.update);

// DELETE routes
router.delete("/:id", ServicePriceController.delete);

//PATCH approve
router.patch("/approve/:id", ServicePriceController.approve);

//PATCH reject
router.patch("/reject/:id", ServicePriceController.reject);

module.exports = router;
