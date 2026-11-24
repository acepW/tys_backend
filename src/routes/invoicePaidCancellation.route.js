const express = require("express");
const router = express.Router();
const controller = require("../controllers/invoice/invoicePaidCancellation.controller");
const {
  APPROVAL_FOR,
  APPROVAL_STATUSES,
} = require("../services/invoice/invoicePaidCancellation.service");
const { authenticate } = require("../middleware/auth.middleware");
const { requireApprover } = require("../middleware/approval.middleware");

// Cancellation of a paid invoice (or one with a tax invoice), requested from
// PATCH /invoices/paid-cancellation-request/:id. See docs/invoice-cancellation-paid.md.

router.get("/", authenticate, controller.list);
router.get("/:id", authenticate, controller.getById);

// Sales fixes and resubmits, or withdraws, a request AR & AP rejected
router.put("/resubmit/:id", authenticate, requireApprover(APPROVAL_FOR, ["rejected"]), controller.resubmit);
router.patch("/withdraw/:id", authenticate, requireApprover(APPROVAL_FOR, ["rejected"]), controller.withdraw);

// AR & AP -> SPV FAT Internal -> vice director -> director, each checked against
// the flow of the request's current status
router.patch("/approve/:id", authenticate, requireApprover(APPROVAL_FOR, APPROVAL_STATUSES), controller.approve);
router.patch("/reject/:id", authenticate, requireApprover(APPROVAL_FOR, APPROVAL_STATUSES), controller.reject);
router.patch(
  "/hold/:id",
  authenticate,
  requireApprover(APPROVAL_FOR, ["waiting ar&ap review"]),
  controller.hold,
);

// AR & AP opens the credit note and moves the money (7A)
router.patch(
  "/process-transfer/:id",
  authenticate,
  requireApprover(APPROVAL_FOR, ["waiting for payment transfer"]),
  controller.processTransfer,
);

// AR & AP makes the refund payment request; the cashier pays it with
// PATCH /payment-requests/paid/:id, which completes the cancellation (7B)
router.patch(
  "/create-refund/:id",
  authenticate,
  requireApprover(APPROVAL_FOR, ["waiting for refund process"]),
  controller.createRefund,
);

module.exports = router;
