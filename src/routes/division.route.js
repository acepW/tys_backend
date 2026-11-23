const express = require("express");
const router = express.Router();
const divisionController = require("../controllers/division.controller");
const { authenticate } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, divisionController.getAll);
router.get("/:id", authenticate, divisionController.getById);

// POST routes
router.post("/", authenticate, divisionController.create);

// PUT routes
router.put("/:id", authenticate, divisionController.update);

// DELETE routes
router.delete("/:id", authenticate, divisionController.delete);

module.exports = router;
