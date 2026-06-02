const express = require("express");
const router = express.Router();
const serviceCodeController = require("../controllers/serviceCode.controller");

// GET routes
router.get("/", serviceCodeController.getAll);
router.get("/:id", serviceCodeController.getById);

// POST routes
router.post("/", serviceCodeController.create);

// PUT routes
router.put("/:id", serviceCodeController.update);

// DELETE routes
router.delete("/:id", serviceCodeController.delete);

module.exports = router;
