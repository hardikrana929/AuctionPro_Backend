const express = require("express");
const rateLimit = require("express-rate-limit");
const { sendOtp, verifyOtp } = require("../controllers/siteOtpController");

const router = express.Router();
const limiter = (limit, message) =>
  rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, message: { success: false, message } });

router.post("/send", limiter(10, "Too many OTP requests. Please try again later."), sendOtp);
router.post("/verify", limiter(30, "Too many verification attempts. Please try again later."), verifyOtp);

module.exports = router;
