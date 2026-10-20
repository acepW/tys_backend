const router = require("express").Router();
const controller = require("../controllers/inventory/inventoryOpname.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { requireApprover } = require("../middleware/approval.middleware");

// Flow: create (pending) -> save item counts -> request -> approver reviews each
// item (rejected items are corrected and saved again) -> approve updates the stock.
router.get("/", authenticate, controller.getAll);
router.get("/:id", authenticate, controller.getById);
router.get("/:id/items", authenticate, controller.getItems);
router.post("/", authenticate, controller.create);
router.put("/:id/items", authenticate, controller.saveItems);
router.patch("/request/:id", authenticate, controller.request);
router.patch("/review/:id/items", authenticate, requireApprover("inventory opname", ["request"]), controller.reviewItems);
router.patch("/approve/:id", authenticate, requireApprover("inventory opname", ["request"]), controller.approve);
router.delete("/:id", authenticate, controller.cancel);

module.exports = router;
