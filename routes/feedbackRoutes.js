const express = require("express");
const { protectRoute, adminOnly } = require("../middleware/authMiddleware");
const controller = require("../controllers/feedbackController");

const router = express.Router();
router.use(protectRoute);
router.post("/", controller.submitFeedback);
router.get("/mine", controller.getMyFeedback);
router.get("/", adminOnly, controller.getAllFeedback);
router.patch("/:feedbackId", adminOnly, controller.updateFeedback);
module.exports = router;
