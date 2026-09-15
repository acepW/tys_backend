const express = require("express");
const router = express.Router();
const taxController = require("../controllers/masterTax/tax.controller");
const { authenticate } = require("../middleware/auth.middleware");

router.get("/", authenticate, taxController.getAll);
router.get("/:id", authenticate, taxController.getById);
router.post("/", authenticate, taxController.create);
router.put("/:id", authenticate, taxController.update);
router.delete("/:id", authenticate, taxController.delete);

module.exports = router;
