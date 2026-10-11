const express = require("express");
const { protectRoute } = require("../middleware/authMiddleware");
const { getUserDashboard } = require("../controllers/userDashboardController");

const router = express.Router();
router.use(protectRoute);
router.get("/dashboard", (req, res, next) => {
  if (req.user?.role !== "user") {
    return res.status(403).json({ success: false, message: "User account access required" });
  }
  return getUserDashboard(req, res, next);
});

module.exports = router;
