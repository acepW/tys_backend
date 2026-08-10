const express = require("express");
const router = express.Router();
const governmentCostController = require("../controllers/masterGovermentCost/governmentCost.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, governmentCostController.getAll);
router.get("/:id", authenticate, governmentCostController.getById);

// POST routes
router.post("/", authenticate, governmentCostController.create);

// PUT routes
router.put("/:id", authenticate, governmentCostController.update);

// DELETE routes
router.delete("/:id", authenticate, governmentCostController.delete);

module.exports = router;
