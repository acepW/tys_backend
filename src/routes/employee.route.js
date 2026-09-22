const express = require("express");
const router = express.Router();
const controller = require("../controllers/humanResource/employee.controller");
const { authenticate } = require("../middleware/auth.middleware");

router.get("/", authenticate, controller.getAll);
router.get("/:id", authenticate, controller.getById);
router.post("/", authenticate, controller.create);
router.put("/:id", authenticate, controller.update);
router.delete("/:id", authenticate, controller.delete);

module.exports = router;
