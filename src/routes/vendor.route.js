const express = require("express");
const router = express.Router();
const vendorController = require("../controllers/vendor/vendor.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, vendorController.getAll);
router.get("/:id", authenticate, vendorController.getById);

// POST routes
router.post("/", authenticate, vendorController.create);

// PATCH routes
router.patch("/approve/:id", authenticate, vendorController.approve);

// PATCH routes
router.patch("/reject/:id", authenticate, vendorController.reject);

// DELETE routes
router.delete("/:id", authenticate, vendorController.delete);

module.exports = router;
