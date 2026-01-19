const express = require("express");
const router = express.Router();
const companyController = require("../controllers/company.controller");

// GET routes
router.get("/", companyController.getAll);
router.get("/active", companyController.getActive);
router.get("/search", companyController.search);
router.get("/:id", companyController.getById);

// POST routes
router.post("/", companyController.create);

// PUT routes
router.put("/:id", companyController.update);

// DELETE routes
router.delete("/:id", companyController.delete);

module.exports = router;
