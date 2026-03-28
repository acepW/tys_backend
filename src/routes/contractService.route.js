const express = require("express");
const router = express.Router();
const contractServiceController = require("../controllers/contract/contractService.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, contractServiceController.getAll);
router.get("/:id", authenticate, contractServiceController.getById);

module.exports = router;
