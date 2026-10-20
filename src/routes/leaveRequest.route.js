const router = require("express").Router();
const controller = require("../controllers/humanResource/leaveRequest.controller");
const { authenticate } = require("../middleware/auth.middleware");

router.get("/", authenticate, controller.getAll);
router.get("/:id", authenticate, controller.getById);
router.post("/", authenticate, controller.create);
router.put("/:id", authenticate, controller.update);

// Approval chain: supervisor -> HR -> SPV HR -> manager HR -> director
// (-> HR verification for a sick leave without a doctor's letter).
// Not wired to approval_flows yet; any user can act, only the status order is checked.
for (const [path, stage] of [
  ["supervisor", "supervisor"],
  ["hr", "hr"],
  ["spv-hr", "spv hr"],
  ["manager-hr", "manager hr"],
  ["director", "director"],
]) {
  router.patch(`/${path}/approve/:id`, authenticate, controller.decide(stage, "approve"));
  router.patch(`/${path}/reject/:id`, authenticate, controller.decide(stage, "reject"));
}
// Sick leave whose doctor's letter was not attached at HR approval: after the
// director, admin/SPV HR attaches it here (added to files_attachment).
router.patch("/verification-hr/verify/:id", authenticate, controller.verifyHr);

module.exports = router;
