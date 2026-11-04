const router = require("express").Router();
const controller = require("../controllers/inventory/inventoryMovement.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { requireApprover } = require("../middleware/approval.middleware");

// Flow: create (request spv ga) -> SPV GA approves (request manager ga) ->
// Manager GA approves (approved, stock moves). Either can reject (rejected).
const openStatuses = ["request spv ga", "request manager ga"];

router.get("/", authenticate, controller.getAll);
router.get("/:id", authenticate, controller.getById);
router.post("/", authenticate, controller.create);
router.patch("/approve/:id", authenticate, requireApprover("inventory movement", openStatuses), controller.approve);
router.patch("/reject/:id", authenticate, requireApprover("inventory movement", openStatuses), controller.reject);

module.exports = router;
