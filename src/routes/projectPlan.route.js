const express = require("express");
const router = express.Router();
const ProjectPlanController = require("../controllers/projectPlan.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, ProjectPlanController.getAll);
router.get("/:id", authenticate, ProjectPlanController.getById);

// POST routes
router.post("/", authenticate, ProjectPlanController.create);

// PUT routes
router.put("/:id_service_pricing", authenticate, ProjectPlanController.update);

// DELETE routes
router.delete("/:id", authenticate, ProjectPlanController.delete);

module.exports = router;
