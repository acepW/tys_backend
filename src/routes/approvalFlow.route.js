const express = require("express");
const router = express.Router();
const approvalFlowController = require("../controllers/approvalFlow/approvalFlow.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, approvalFlowController.getAll);
router.get("/:id", authenticate, approvalFlowController.getById);

// POST routes
router.post("/", authenticate, approvalFlowController.create);

// PUT routes
router.put("/:id", authenticate, approvalFlowController.update);

// DELETE routes
router.delete("/:id", authenticate, approvalFlowController.delete);

module.exports = router;
