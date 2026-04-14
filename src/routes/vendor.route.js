const express = require("express");
const router = express.Router();
const vendorController = require("../controllers/vendor.controller");

// GET routes
router.get("/", vendorController.getAll);
router.get("/:id", vendorController.getById);

// POST routes
router.post("/", vendorController.create);

// PUT routes
router.put("/:id", vendorController.update);

// DELETE routes
router.delete("/:id", vendorController.delete);

module.exports = router;
