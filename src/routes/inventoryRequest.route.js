const router = require("express").Router();
const controller = require("../controllers/inventory/inventoryRequest.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { requireApprover } = require("../middleware/approval.middleware");

router.get("/", authenticate, controller.getAll);
router.get("/:id", authenticate, controller.getById);
router.post("/", authenticate, controller.create);
router.put("/:id", authenticate, controller.update);
router.patch("/approve/:id", authenticate, requireApprover("inventory request", ["pending"]), controller.approve);
router.patch("/reject/:id", authenticate, requireApprover("inventory request", ["pending"]), controller.reject);

module.exports = router;
