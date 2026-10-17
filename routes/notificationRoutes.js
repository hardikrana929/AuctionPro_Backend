const express = require("express");
const { protectRoute } = require("../middleware/authMiddleware");
const controller = require("../controllers/notificationController");

const router = express.Router();
router.use(protectRoute);
router.get("/", controller.getNotifications);
router.patch("/read-all", controller.markAllRead);
router.patch("/:notificationId/read", controller.markRead);
module.exports = router;
