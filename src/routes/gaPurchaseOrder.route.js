const router = require("express").Router();
const controller = require("../controllers/gaPurchaseOrder/gaPurchaseOrder.controller");
const { authenticate } = require("../middleware/auth.middleware");

const action = (name) => (req, res) => controller.action(
  { ...req, params: { ...req.params, action: name }, body: req.body, user: req.user }, res,
);

router.get("/no/documents", authenticate, controller.getNo);
router.get("/", authenticate, controller.getAll);
router.get("/:id", authenticate, controller.getById);
router.post("/", authenticate, controller.create);
router.put("/:id", authenticate, controller.update);

// Approval flow: GA manager -> director -> FAT -> cashier -> GA staff (accept/return per item).
// The GA manager and cashier endpoints also drain orders left in the old return cycle.
for (const [path, role] of [["ga-manager", "ga_manager"], ["director", "director"],
  ["fat", "fat"], ["cashier", "cashier"]]) {
  router.patch(`/${path}/approve/:id`, authenticate, action(`approve_${role}`));
  router.patch(`/${path}/reject/:id`, authenticate, action(`reject_${role}`));
}
router.patch("/ga-staff/accept/:id/items/:itemId", authenticate, controller.acceptItem);
router.patch("/ga-staff/return/:id/items/:itemId", authenticate, controller.returnItem);

module.exports = router;
