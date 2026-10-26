const express = require("express");
const rateLimit = require("express-rate-limit");
const { sendOtp, verifyOtp } = require("../controllers/siteOtpController");
const router = express.Router();
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { message: "Too many OTP requests. Please try again later." } });
router.post("/send", otpLimiter, sendOtp);
router.post("/verify", otpLimiter, verifyOtp);
module.exports = router;
