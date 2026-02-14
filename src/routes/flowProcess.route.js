const express = require("express");
const router = express.Router();
const FlowProcessController = require("../controllers/flowProcess.controller");

// GET routes
router.get("/", FlowProcessController.getAll);
router.get("/:id", FlowProcessController.getById);

// POST routes
router.post("/", FlowProcessController.create);

// PUT routes
router.put("/:categoryId", FlowProcessController.update);

// DELETE routes
router.delete("/:id", FlowProcessController.delete);

module.exports = router;
