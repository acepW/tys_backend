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
router.put("/:id/receiving", authenticate, controller.updateReceiving);

// Approval flow: GA manager -> director -> AR/AP -> FAT -> cashier -> GA staff (accept/return).
// The return cycle reuses the GA manager, AR/AP and cashier endpoints.
for (const [path, role] of [["ga-manager", "ga_manager"], ["director", "director"],
  ["ar-ap", "ar_ap"], ["fat", "fat"], ["cashier", "cashier"]]) {
  router.patch(`/${path}/approve/:id`, authenticate, action(`approve_${role}`));
  router.patch(`/${path}/reject/:id`, authenticate, action(`reject_${role}`));
}
router.patch("/ga-staff/accept/:id", authenticate, action("accept_goods"));
router.patch("/ga-staff/return/:id", authenticate, action("return_goods"));

module.exports = router;
