const express = require("express");
const router = express.Router();
const contractController = require("../controllers/contarct.controller");

// GET routes
router.get("/", contractController.getAll);
router.get("/:id", contractController.getById);

// POST routes
router.post("/", contractController.create);

// PUT routes
router.put("/:id", contractController.update);

// PATCH routes
router.patch("/submit/:id", contractController.submit);

// PATCH routes
router.patch("/approve/:id", contractController.approve);

// PATCH routes
router.patch("/reject/:id", contractController.reject);

// PATCH routes
router.patch("/send-to-customer/:id", contractController.sendToCustomer);

// PATCH routes
router.patch("/approve-customer/:id", contractController.approveByCustomer);

// PATCH routes
router.patch("/reject-customer/:id", contractController.rejectByCustomer);

// DELETE routes
router.delete("/:id", contractController.delete);

module.exports = router;
