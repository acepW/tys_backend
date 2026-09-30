const router = require("express").Router();
const controller = require("../controllers/purchaseRequest/purchaseRequest.controller");
const { authenticate } = require("../middleware/auth.middleware");

const action = (name) => (req, res) =>
  controller.action(
    {
      ...req,
      params: { ...req.params, action: name },
      body: req.body,
      user: req.user,
    },
    res,
  );

router.get("/no/documents", authenticate, controller.getNo);
router.get(
  "/to-process-ga-order",
  authenticate,
  controller.getToProcessGaOrder,
);
router.get("/", authenticate, controller.getAll);
router.get("/:id", authenticate, controller.getById);
router.post("/", authenticate, controller.create);
router.put("/:id", authenticate, controller.update);
router.patch("/request-manager/:id", authenticate, action("request_manager"));
router.patch("/manager/approve/:id", authenticate, action("approve_manager"));
router.patch("/manager/reject/:id", authenticate, action("reject_manager"));
router.patch("/ga/approve/:id", authenticate, action("approve_ga"));
router.patch("/ga/reject/:id", authenticate, action("reject_ga"));

module.exports = router;
