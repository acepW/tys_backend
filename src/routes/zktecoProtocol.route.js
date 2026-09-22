const express = require("express");
const router = express.Router();
const controller = require("../controllers/humanResource/zktecoProtocol.controller");

router.use(express.text({ type: "*/*", limit: "5mb" }));
router.get("/cdata", controller.initialize);
router.post("/cdata", controller.receiveData);
router.get("/getrequest", controller.getRequest);
router.post("/devicecmd", controller.acknowledgeCommand);

module.exports = router;
