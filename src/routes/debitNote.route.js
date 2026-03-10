const express = require("express");
const router = express.Router();
const DebitNoteController = require("../controllers/debitNote.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, DebitNoteController.getAll);
router.get("/:id", authenticate, DebitNoteController.getById);

// POST routes
router.post("/", authenticate, DebitNoteController.create);

// PUT routes
router.put("/:id", authenticate, DebitNoteController.update);

// DELETE routes
router.delete("/:id", authenticate, DebitNoteController.delete);

//PATCH submit
router.patch("/submit/:id", authenticate, DebitNoteController.submit);

//PATCH approve
router.patch("/approve/:id", authenticate, DebitNoteController.approve);

//PATCH reject
router.patch("/reject/:id", authenticate, DebitNoteController.reject);

module.exports = router;
