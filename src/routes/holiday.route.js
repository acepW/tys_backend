const express = require("express");
const router = express.Router();
const controller = require("../controllers/humanResource/holiday.controller");
const { authenticate } = require("../middleware/auth.middleware");

router.get("/", authenticate, controller.getAll);
router.post("/generate-year", authenticate, controller.generateYear);
router.post("/", authenticate, controller.create);
router.delete("/:id", authenticate, controller.delete);

module.exports = router;
