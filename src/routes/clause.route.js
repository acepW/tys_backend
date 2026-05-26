const express = require("express");
const router = express.Router();
const clauseController = require("../controllers/masterClause/clause.controller");

// GET routes
router.get("/", clauseController.getAllTemplates);
router.get("/:id", clauseController.getTemplateById);

// POST routes
router.post("/", clauseController.createUpdateTemplate);

// PUT routes
router.put("/", clauseController.createUpdateTemplate);

// DELETE routes
router.delete("/:id", clauseController.deleteTemplate);

module.exports = router;
