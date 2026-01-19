const express = require("express");
const router = express.Router();
const productController = require("../controllers/product.controller");

// GET routes
router.get("/", productController.getAll);
router.get("/:id", productController.getById);

// POST routes
router.post("/", productController.create);

// PUT routes
router.put("/:id", productController.update);

// DELETE routes
router.delete("/:id", productController.delete);

module.exports = router;
