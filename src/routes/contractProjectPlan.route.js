const express = require("express");
const router = express.Router();
const contractProjectPlanController = require("../controllers/contract/contractProjectPlan.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// GET routes
router.get("/", authenticate, contractProjectPlanController.getAll);
router.get("/:id", authenticate, contractProjectPlanController.getById);

// POST routes
router.post("/", authenticate, contractProjectPlanController.create);

// PUT routes
router.put(
  "/:id_contract_service",
  authenticate,
  contractProjectPlanController.update,
);

// PATCH routes
router.patch("/start/:id", authenticate, contractProjectPlanController.start);

// PATCH routes
router.patch("/stop/:id", authenticate, contractProjectPlanController.stop);

// PATCH routes
router.patch(
  "/points/fill/:point_id",
  authenticate,
  contractProjectPlanController.inputContractProjectPlan,
);
// PATCH routes
router.patch(
  "/costs/fill/:cost_id",
  authenticate,
  contractProjectPlanController.inputContractProjectPlanCost,
);

// DELETE routes
router.delete("/:id", authenticate, contractProjectPlanController.delete);

module.exports = router;
