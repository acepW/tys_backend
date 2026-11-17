const router = require("express").Router();
const {
  MODULES,
  modules,
  candidateOptions,
  setRequestHiringStatus,
  resubmitRequest,
} = require("../controllers/humanResource/recruitment.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { requireApprover } = require("../middleware/approval.middleware");

// Recruitment: requests, candidates, then per candidate HR interview -> user
// interview -> offering letter -> employment contract. Every document but the
// candidate is approved or rejected through its approval flow; a request goes
// through HR Staff, SPV HR, Manager HR and Director, and a rejection may return it
// to an earlier stage or to the requester, who resubmits it. Candidates have no
// approval.
router.get("/candidates/options", authenticate, candidateOptions);
router.patch("/requests/hiring-status/:id", authenticate, setRequestHiringStatus);
router.patch("/requests/resubmit/:id", authenticate, resubmitRequest);

for (const [path, controller] of Object.entries(modules)) {
  router.get(`/${path}`, authenticate, controller.getAll);
  router.get(`/${path}/:id`, authenticate, controller.getById);
  router.post(`/${path}`, authenticate, controller.create);
  router.put(`/${path}/:id`, authenticate, controller.update);
  const { approvalFor } = MODULES[path];
  if (!approvalFor) continue;
  // Every approval status of the module may be approved or rejected.
  const approver = requireApprover(approvalFor);
  router.patch(`/${path}/approve/:id`, authenticate, approver, controller.decide("approve"));
  router.patch(`/${path}/reject/:id`, authenticate, approver, controller.decide("reject"));
}

module.exports = router;
