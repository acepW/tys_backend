const express = require("express");
const router = express.Router();
const clauseController = require("../controllers/clause.controller");

// GET routes
router.get("/", clauseController.getAll);
router.get("/:id", clauseController.getById);

// POST routes
router.post("/", clauseController.createUpdate);

// PUT routes
router.put("/", clauseController.createUpdate);

// DELETE routes
router.delete("/:id", clauseController.delete);

module.exports = router;
