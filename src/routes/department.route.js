const express = require("express");
const router = express.Router();
const departmentController = require("../controllers/department/department.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, departmentController.getAll);
router.get("/:id", authenticate, departmentController.getById);

// POST routes
router.post("/", authenticate, departmentController.create);

// PUT routes
router.put("/:id", authenticate, departmentController.update);

// DELETE routes
router.delete("/:id", authenticate, departmentController.delete);

module.exports = router;
