const express = require("express");
const router = express.Router();
const InvoiceController = require("../controllers/invoice/invoice.controller");
const {
  taxInvoiceRequestStatuses,
  editableStatuses,
  whtUploadStatuses,
  cancellationStatuses,
} = require("../services/invoice/invoice.service");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { requireApprover } = require("../middleware/approval.middleware");
const PaidCancellationController = require("../controllers/invoice/invoicePaidCancellation.controller");
const CreditNoteController = require("../controllers/creditNote/creditNote.controller");
const { TARGET_INVOICE_STATUSES: creditNoteTargetStatuses } = require("../services/creditNote/creditNote.service");
const { ELIGIBLE_STATUSES: paidCancellationStatuses } = require("../services/invoice/invoicePaidCancellation.service");

// GET routes
router.get("/incoming", authenticate, InvoiceController.getIncoming);
router.get("/", authenticate, InvoiceController.getAll);
router.get("/no/documents", authenticate, InvoiceController.getNoInvoice);
router.get("/:id", authenticate, InvoiceController.getById);
// What sales needs before requesting the cancellation of a paid invoice
router.get("/:id/paid-cancellation/preview", authenticate, PaidCancellationController.preview);

// POST routes
router.post("/from-incoming", authenticate, InvoiceController.createFromIncoming);
router.post("/", authenticate, InvoiceController.create);

// PUT routes
router.put("/:id", authenticate, InvoiceController.update);

// DELETE routes
router.delete("/:id", authenticate, InvoiceController.delete);

//PATCH submit
// (also resubmits an invoice SPV rejected for its tax)
router.patch("/submit/:id", authenticate, requireApprover("invoice", editableStatuses), InvoiceController.submit);

//PATCH approve (no file upload); the invoice goes straight to waiting for payment
router.patch("/approve/:id", authenticate, requireApprover("invoice", ["on verification"]), InvoiceController.approve);

//PATCH reject (reject_type tax -> rejected, back to AR & AP; ct/po cancelled -> cancelled)
router.patch("/reject/:id", authenticate, requireApprover("invoice", ["on verification"]), InvoiceController.reject);

//PATCH upload payment proof (sales); several accepted proofs may add up to the total
router.patch(
  "/upload-payment/:id",
  authenticate,
  requireApprover("invoice", ["waiting for payment", "payment proof rejected"]),
  InvoiceController.uploadPayment,
);

//PATCH accept / reject payment proof (AR & AP)
router.patch(
  "/payment-accept/:id",
  authenticate,
  requireApprover("invoice", ["payment verification"]),
  InvoiceController.acceptPayment,
);
router.patch(
  "/payment-reject/:id",
  authenticate,
  requireApprover("invoice", ["payment verification"]),
  InvoiceController.rejectPayment,
);

//PATCH withholding tax receipt (bukti potong), one per PPh type of a paid-off
// invoice: sales uploads (checked against the sales flow at "paid waiting wht",
// since another receipt may be in verification) -> AR & AP accepts or rejects
router.patch(
  "/:id/withholding-taxes/:whtId/upload",
  authenticate,
  requireApprover("invoice", whtUploadStatuses, "paid waiting wht"),
  InvoiceController.uploadWithholdingTax,
);
router.patch(
  "/:id/withholding-taxes/:whtId/accept",
  authenticate,
  requireApprover("invoice", ["wht verification"]),
  InvoiceController.acceptWithholdingTax,
);
router.patch(
  "/:id/withholding-taxes/:whtId/reject",
  authenticate,
  requireApprover("invoice", ["wht verification"]),
  InvoiceController.rejectWithholdingTax,
);

//PATCH request tax invoice (sales), checked against the sales flow at "waiting for
// payment" because the request stays open while AR & AP verifies a payment
router.patch(
  "/tax-invoice-request/:id",
  authenticate,
  requireApprover("invoice", taxInvoiceRequestStatuses, "waiting for payment"),
  InvoiceController.requestTaxInvoice,
);

//PATCH final invoice + tax invoice (faktur pajak; final invoice only without PPN),
// AR & AP once requested
router.patch(
  "/tax-invoice/:id",
  authenticate,
  requireApprover("invoice tax invoice", ["requested"]),
  InvoiceController.uploadTaxInvoice,
);

//PATCH revision: sales requests -> AR & AP revises the taxes, PPN and PPh (or rejects the request)
// -> SPV FAT Internal approves (back to waiting for payment) or rejects (back to AR & AP)
router.patch(
  "/revision-request/:id",
  authenticate,
  requireApprover("invoice", ["waiting for payment"]),
  InvoiceController.requestRevision,
);
router.patch(
  "/revision-request-reject/:id",
  authenticate,
  requireApprover("invoice", ["revision requested"]),
  InvoiceController.rejectRevisionRequest,
);
router.patch(
  "/revise/:id",
  authenticate,
  requireApprover("invoice", ["revision requested"]),
  InvoiceController.revise,
);
router.patch(
  "/revision-approve/:id",
  authenticate,
  requireApprover("invoice", ["waiting for revision"]),
  InvoiceController.approveRevision,
);
router.patch(
  "/revision-reject/:id",
  authenticate,
  requireApprover("invoice", ["waiting for revision"]),
  InvoiceController.rejectRevision,
);

//PATCH cancellation of an unpaid proforma (cancel, or convert to 50%): sales
// requests -> AR & AP -> SPV FAT Internal -> director; approve/reject act on the
// current step and are checked against that step's flow
router.patch(
  "/cancellation-request/:id",
  authenticate,
  requireApprover("invoice", ["waiting for payment"]),
  InvoiceController.requestCancellation,
);
router.patch(
  "/cancellation-approve/:id",
  authenticate,
  requireApprover("invoice", cancellationStatuses),
  InvoiceController.approveCancellation,
);
router.patch(
  "/cancellation-reject/:id",
  authenticate,
  requireApprover("invoice", cancellationStatuses),
  InvoiceController.rejectCancellation,
);

//PATCH cancellation of a paid invoice (or one with a tax invoice): sales requests
// it (checked against the sales flow at "waiting for payment"); the approvals run
// on /invoice-paid-cancellations. See docs/invoice-cancellation-paid.md
router.patch(
  "/paid-cancellation-request/:id",
  authenticate,
  requireApprover("invoice", paidCancellationStatuses, "waiting for payment"),
  PaidCancellationController.request,
);

//PATCH AR & AP pays the invoice from the deposit of a credit note (checked against
// the AR & AP flow at "payment verification", as for an accepted payment proof)
router.patch(
  "/credit-note-payment/:id",
  authenticate,
  requireApprover("invoice", creditNoteTargetStatuses, "payment verification"),
  CreditNoteController.payInvoice,
);

module.exports = router;
