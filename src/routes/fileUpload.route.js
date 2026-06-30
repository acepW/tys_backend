const express = require("express");
const router = express.Router();
const fileUploadController = require("../controllers/fileUpload.controller");
const {
  uploadSingle,
  uploadMultiple,
} = require("../middlewares/upload.middleware");

// GET routes
router.get("/info", fileUploadController.getInfo); // ?url=...
router.get("/download", fileUploadController.download); // ?url=...
router.get("/:folderAlias", fileUploadController.list); // list isi folder

// POST routes
router.post(
  "/:folderAlias/single",
  uploadSingle,
  fileUploadController.uploadSingle
);
router.post(
  "/:folderAlias/multiple",
  uploadMultiple,
  fileUploadController.uploadMultiple
);

// DELETE routes
router.delete("/", fileUploadController.delete); // body: { url }

module.exports = router;
