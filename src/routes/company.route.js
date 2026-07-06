const express = require("express");
const router = express.Router();
const companyController = require("../controllers/company.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, companyController.getAll);
router.get("/active", authenticate, companyController.getActive);
router.get("/search", authenticate, companyController.search);
router.get("/:id", authenticate, companyController.getById);

// POST routes
router.post("/", authenticate, companyController.create);

// PUT routes
router.put("/:id", authenticate, companyController.update);

// DELETE routes
router.delete("/:id", authenticate, companyController.delete);

module.exports = router;
