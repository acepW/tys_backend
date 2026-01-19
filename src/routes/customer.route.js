const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customer.controller");

// GET routes
router.get("/", customerController.getAll);
router.get("/active", customerController.getActive);
router.get("/search", customerController.search);
router.get("/:id", customerController.getById);

// POST routes
router.post("/", customerController.create);

// PUT routes
router.put("/:id", customerController.update);

// DELETE routes
router.delete("/:id", customerController.delete);

module.exports = router;
