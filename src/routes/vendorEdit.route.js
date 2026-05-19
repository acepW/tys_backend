const express = require("express");
const router = express.Router();
const vendorEditController = require("../controllers/vendor/vendorEdit.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, vendorEditController.getAll);
router.get("/:id", authenticate, vendorEditController.getById);

// POST routes
router.post("/", authenticate, vendorEditController.create);

// PATCH routes
router.patch("/approve/:id", authenticate, vendorEditController.approve);

// PATCH routes
router.patch("/reject/:id", authenticate, vendorEditController.reject);

// DELETE routes
router.delete("/:id", authenticate, vendorEditController.delete);

module.exports = router;
