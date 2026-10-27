const express = require("express");
const router = express.Router();
const levelController = require("../controllers/level.controller");
const { authenticate } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, levelController.getAll);
router.get("/:id", authenticate, levelController.getById);

// POST routes
router.post("/", authenticate, levelController.create);

// PUT routes
router.put("/:id", authenticate, levelController.update);

// DELETE routes
router.delete("/:id", authenticate, levelController.delete);

module.exports = router;
