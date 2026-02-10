const express = require("express");
const router = express.Router();
const divisionController = require("../controllers/division.controller");

// GET routes
router.get("/", divisionController.getAll);
router.get("/:id", divisionController.getById);

// POST routes
router.post("/", divisionController.create);

// PUT routes
router.put("/:id", divisionController.update);

// DELETE routes
router.delete("/:id", divisionController.delete);

module.exports = router;
