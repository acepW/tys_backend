const express = require("express");
const router = express.Router();
const menuController = require("../controllers/menu.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// Public — sidebar frontend butuh ini tanpa perlu filter auth
router.get("/", authenticate, menuController.getAll);
router.get("/:id", authenticate, menuController.getById);

// Master data — hanya admin/superadmin yang boleh
router.post("/", authenticate, menuController.create);
router.put("/:id", authenticate, menuController.update);
router.delete("/:id", authenticate, menuController.delete);
router.post("/seed", authenticate, menuController.seed);

module.exports = router;
