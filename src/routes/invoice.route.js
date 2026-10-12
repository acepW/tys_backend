const express = require("express");
const router = express.Router();
const InvoiceController = require("../controllers/invoice/invoice.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { requireApprover } = require("../middleware/approval.middleware");

// GET routes
router.get("/incoming", authenticate, InvoiceController.getIncoming);
router.get("/", authenticate, InvoiceController.getAll);
router.get("/no/documents", authenticate, InvoiceController.getNoInvoice);
router.get("/:id", authenticate, InvoiceController.getById);

// POST routes
router.post("/from-incoming", authenticate, InvoiceController.createFromIncoming);
router.post("/", authenticate, InvoiceController.create);

// PUT routes
router.put("/:id", authenticate, InvoiceController.update);

// DELETE routes
router.delete("/:id", authenticate, InvoiceController.delete);

//PATCH submit
router.patch("/submit/:id", authenticate, requireApprover("invoice", ["pending"]), InvoiceController.submit);

//PATCH approve
router.patch("/approve/:id", authenticate, requireApprover("invoice", ["on verification"]), InvoiceController.approve);

//PATCH reject
router.patch("/reject/:id", authenticate, requireApprover("invoice", ["on verification"]), InvoiceController.reject);

//PATCH signing
router.patch("/signing/:id", authenticate, requireApprover("invoice", ["approved"]), InvoiceController.signing);

//PATCH waiting for payment
router.patch(
  "/waiting-for-payment/:id",
  authenticate,
  requireApprover("invoice", ["signing"]),
  InvoiceController.waitingForPayment,
);

//PATCH pay
router.patch("/pay/:id", authenticate, requireApprover("invoice", ["waiting for payment"]), InvoiceController.pay);

//PATCH tax invoice (faktur pajak)
router.patch("/tax-invoice/:id", authenticate, InvoiceController.uploadTaxInvoice);

module.exports = router;
