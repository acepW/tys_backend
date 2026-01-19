const express = require("express");
const router = express.Router();
const categoryController = require("../controllers/category.controller");

// GET routes
router.get("/", categoryController.getAll);
router.get("/active", categoryController.getActive);
router.get("/with-sub", categoryController.getAllWithSub);
router.get("/:id", categoryController.getById);

// POST routes
router.post("/", categoryController.create);

// PUT routes
router.put("/:id", categoryController.update);

// DELETE routes
router.delete("/:id", categoryController.delete);

module.exports = router;
