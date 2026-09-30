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
router.patch("/ga-manager/approve/:id", authenticate, action("approve_ga_manager"));
router.patch("/ga-manager/reject/:id", authenticate, action("reject_ga_manager"));
router.patch("/fat/approve/:id", authenticate, action("approve_fat"));
router.patch("/fat/reject/:id", authenticate, action("reject_fat"));
router.patch("/director/approve/:id", authenticate, action("approve_director"));
router.patch("/director/reject/:id", authenticate, action("reject_director"));

module.exports = router;
