const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customer.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, customerController.getAll);
router.get("/active", authenticate, customerController.getActive);
router.get("/search", authenticate, customerController.search);
router.get("/:id", authenticate, customerController.getById);

// POST routes
router.post("/", authenticate, customerController.create);

// PUT routes
router.put("/:id", authenticate, customerController.update);

// DELETE routes
router.delete("/:id", authenticate, customerController.delete);

module.exports = router;
