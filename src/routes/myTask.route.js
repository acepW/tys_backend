const router = require("express").Router();
const myTaskController = require("../controllers/approvalFlow/myTask.controller");
const { authenticate } = require("../middleware/auth.middleware");

router.get("/", authenticate, myTaskController.getAll);
router.get("/can-act", authenticate, myTaskController.canAct);

module.exports = router;
