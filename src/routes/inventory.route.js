const router = require("express").Router();
const controller = require("../controllers/inventory/inventory.controller");
const { authenticate } = require("../middleware/auth.middleware");

router.get("/", authenticate, controller.getAll);
router.get("/check-stock", authenticate, controller.checkStock);
router.get("/:id", authenticate, controller.getById);
// Manual stock entry goes through approval: see /inventory-requests.

module.exports = router;
