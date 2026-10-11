
const express = require("express");
const rateLimit = require("express-rate-limit");

const { adminLogin, userLogin, getMe, } = require("../controllers/authController");

const { protectRoute } = require("../middleware/authMiddleware");

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many login attempts. Please try again later.",
    },
});

router.post("/admin/login", loginLimiter, adminLogin);
router.post("/user/login", loginLimiter, userLogin);

router.get("/me", protectRoute, getMe);

module.exports = router;
