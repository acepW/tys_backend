const express = require("express");
const router = express.Router();
const subCategoryController = require("../controllers/subCategory.controller");

// GET routes
router.get("/", subCategoryController.getAll);
router.get("/category/:categoryId", subCategoryController.getByCategoryId);
router.get("/:id", subCategoryController.getById);

// POST routes
router.post("/", subCategoryController.create);

// PUT routes
router.put("/:id", subCategoryController.update);

// DELETE routes
router.delete("/:id", subCategoryController.delete);

module.exports = router;
