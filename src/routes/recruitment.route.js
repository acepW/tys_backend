const router = require("express").Router();
const {
  MODULES,
  modules,
  candidateOptions,
  setRequestHiringStatus,
} = require("../controllers/humanResource/recruitment.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { requireApprover } = require("../middleware/approval.middleware");

// Recruitment: requests, candidates, then per candidate HR interview -> user
// interview -> offering letter -> employment contract. Every document is created
// pending and approved or rejected through its approval flow; a request goes
// through HR Staff, SPV/Manager HR and Director.
router.get("/candidates/options", authenticate, candidateOptions);
router.patch("/requests/hiring-status/:id", authenticate, setRequestHiringStatus);

for (const [path, controller] of Object.entries(modules)) {
  // Every approval status of the module may be approved or rejected.
  const approver = requireApprover(MODULES[path].approvalFor);
  router.get(`/${path}`, authenticate, controller.getAll);
  router.get(`/${path}/:id`, authenticate, controller.getById);
  router.post(`/${path}`, authenticate, controller.create);
  router.put(`/${path}/:id`, authenticate, controller.update);
  router.patch(`/${path}/approve/:id`, authenticate, approver, controller.decide("approve"));
  router.patch(`/${path}/reject/:id`, authenticate, approver, controller.decide("reject"));
}

module.exports = router;
