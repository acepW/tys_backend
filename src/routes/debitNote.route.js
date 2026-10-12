const express = require("express");
const router = express.Router();
const DebitNoteController = require("../controllers/debitNote/debitNote.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { requireApprover } = require("../middleware/approval.middleware");

// GET routes
router.get("/incoming", authenticate, DebitNoteController.getIncoming);
router.get("/", authenticate, DebitNoteController.getAll);
router.get("/:id", authenticate, DebitNoteController.getById);
router.get("/no/documents", authenticate, DebitNoteController.getNoDebitNote);

// POST routes
router.post(
  "/from-incoming",
  authenticate,
  DebitNoteController.createFromIncoming,
);
router.post("/", authenticate, DebitNoteController.create);

// PUT routes
router.put("/:id", authenticate, DebitNoteController.update);

// DELETE routes
router.delete("/:id", authenticate, DebitNoteController.delete);

//PATCH submit
router.patch("/submit/:id", authenticate, requireApprover("debit note", ["pending"]), DebitNoteController.submit);

//PATCH approve
router.patch("/approve/:id", authenticate, requireApprover("debit note", ["on verification"]), DebitNoteController.approve);

//PATCH reject
router.patch("/reject/:id", authenticate, requireApprover("debit note", ["on verification"]), DebitNoteController.reject);

//PATCH paid
router.patch("/paid/:id", authenticate, requireApprover("debit note", ["approved"]), DebitNoteController.paid);

module.exports = router;
