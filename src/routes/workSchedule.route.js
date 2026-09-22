const express = require("express");
const router = express.Router();
const controller = require(
  "../controllers/humanResource/workSchedule.controller",
);
const { authenticate } = require("../middleware/auth.middleware");

router.get("/current", authenticate, controller.getCurrent);
router.get("/", authenticate, controller.getAll);
router.get("/:id", authenticate, controller.getById);
router.post("/", authenticate, controller.create);

module.exports = router;
