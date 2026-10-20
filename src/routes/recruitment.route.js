const router = require("express").Router();
const { MODULES, modules, candidateOptions } = require("../controllers/humanResource/recruitment.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { requireApprover } = require("../middleware/approval.middleware");

// Recruitment: requests, candidates, then per candidate HR interview -> user
// interview -> offering letter -> employment contract. Every document is created
// pending and approved or rejected through its approval flow.
router.get("/candidates/options", authenticate, candidateOptions);

for (const [path, controller] of Object.entries(modules)) {
  const approver = requireApprover(MODULES[path].approvalFor, ["pending"]);
  router.get(`/${path}`, authenticate, controller.getAll);
  router.get(`/${path}/:id`, authenticate, controller.getById);
  router.post(`/${path}`, authenticate, controller.create);
  router.put(`/${path}/:id`, authenticate, controller.update);
  router.patch(`/${path}/approve/:id`, authenticate, approver, controller.decide("approve"));
  router.patch(`/${path}/reject/:id`, authenticate, approver, controller.decide("reject"));
}

module.exports = router;
