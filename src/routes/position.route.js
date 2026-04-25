const express = require("express");
const router = express.Router();
const PositionController = require("../controllers/position/position.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, PositionController.getAll);
router.get("/:id", authenticate, PositionController.getById);

// POST routes
router.post("/", authenticate, PositionController.create);

// PUT routes
router.put("/:id", authenticate, PositionController.update);

// DELETE routes
router.delete("/:id", authenticate, PositionController.delete);

module.exports = router;
