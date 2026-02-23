const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

// ─────────────────────────────────────────────
// AUTH ROUTES (public)
// ─────────────────────────────────────────────
router.post("/auth/login", userController.login);
router.post("/auth/logout", authenticate, userController.logout);
router.get("/auth/me", authenticate, userController.getMe);
router.patch(
  "/auth/change-password",
  authenticate,
  userController.changePassword
);

// ─────────────────────────────────────────────
// USER CRUD ROUTES (protected)
// ─────────────────────────────────────────────
router.get("/", authenticate, userController.getAll);
router.get("/active", authenticate, userController.getActive);
router.get("/:id", authenticate, userController.getById);
router.post(
  "/",
  authenticate,
  //authorize("admin"),
  userController.create
);
router.put(
  "/:id",
  authenticate,
  //authorize("admin"),
  userController.update
);
router.delete(
  "/:id",
  // authenticate,
  // authorize("admin"),
  userController.delete
);

module.exports = router;
