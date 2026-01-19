const express = require("express");
const router = express.Router();
const syncController = require("../controllers/sync.controller");

// Check sync status
router.get("/check/all", syncController.checkAllSync);
router.get("/check/:modelName", syncController.checkModelSync);

// Sync operations
router.post("/sync/:modelName/:id", syncController.syncRecord);
router.post("/sync/:modelName/all", syncController.syncAllRecords);

module.exports = router;
