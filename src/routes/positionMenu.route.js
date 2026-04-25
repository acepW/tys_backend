const express = require("express");
const router = express.Router();
const positionMenuController = require("../controllers/position/positionMenu.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

router.get("/:id_position", authenticate, positionMenuController.getByPosition);
router.put(
  "/bulk/:id_position",
  authenticate,
  positionMenuController.bulkUpdate,
);
router.put(
  "/:id_position/:id_menu",
  authenticate,
  positionMenuController.updatePermission,
);

module.exports = router;
