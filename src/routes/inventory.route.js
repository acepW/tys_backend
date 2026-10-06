const router = require("express").Router();
const controller = require("../controllers/inventory/inventory.controller");
const { authenticate } = require("../middleware/auth.middleware");

router.get("/", authenticate, controller.getAll);
router.get("/:id", authenticate, controller.getById);

module.exports = router;
