const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

// For multi-instance production deployments, move OTP records to Redis or MongoDB.
const otpStore = new Map();
const attemptsStore = new Map();
const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const destination = () => process.env.SITE_OTP_EMAIL || "hstudy.project@gmail.com";

function getTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    const err = new Error("Email delivery is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM on the backend.");
    err.statusCode = 503; throw err;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true") === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

exports.sendOtp = async (req, res, next) => {
  try {
    const email = destination().toLowerCase();
    const now = Date.now();
    const previous = otpStore.get(email);
    if (previous && now - previous.sentAt < RESEND_MS) {
      return res.status(429).json({ message: "Please wait 60 seconds before requesting another OTP." });
    }
    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const salt = crypto.randomBytes(16).toString("hex");
    const digest = crypto.createHash("sha256").update(`${salt}:${otp}`).digest("hex");
    // Send first; only activate the code/cooldown after SMTP confirms acceptance.
    await getTransport().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: "Your AuctionPro verification code",
      text: `Your AuctionPro website verification code is ${otp}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#172033"><h2>AuctionPro verification</h2><p>Enter this code to access AuctionPro:</p><div style="font-size:32px;letter-spacing:8px;font-weight:bold;padding:18px;background:#f1f5f9;border-radius:12px;text-align:center">${otp}</div><p>This code expires in 5 minutes. Never share it with anyone.</p></div>`,
    });
    otpStore.set(email, { digest, salt, expiresAt: now + OTP_TTL_MS, sentAt: Date.now(), attempts: 0 });
    return res.status(200).json({ message: "Verification code sent to the configured email address.", expiresInSeconds: 300 });
  } catch (error) { next(error); }
};

exports.verifyOtp = async (req, res, next) => {
  try {
    const email = destination().toLowerCase();
    const record = otpStore.get(email);
    const otp = String(req.body?.otp || "").trim();
    if (!/^\d{6}$/.test(otp)) return res.status(400).json({ message: "Enter the 6-digit OTP." });
    if (!record || Date.now() > record.expiresAt) { otpStore.delete(email); return res.status(400).json({ message: "OTP expired. Request a new code." }); }
    if (record.attempts >= MAX_ATTEMPTS) { otpStore.delete(email); return res.status(429).json({ message: "Too many incorrect attempts. Request a new OTP." }); }
    const digest = crypto.createHash("sha256").update(`${record.salt}:${otp}`).digest("hex");
    if (digest.length !== record.digest.length || !crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(record.digest))) {
      record.attempts += 1;
      return res.status(400).json({ message: `Incorrect OTP. ${Math.max(0, MAX_ATTEMPTS - record.attempts)} attempts remaining.` });
    }
    otpStore.delete(email);
    if (!process.env.JWT_SECRET) {
      const err = new Error("Website verification is not configured. Set JWT_SECRET on the backend.");
      err.statusCode = 503;
      throw err;
    }
    const token = jwt.sign({ purpose: "site-verification", email }, process.env.JWT_SECRET, { issuer: "auctionpro-api", audience: "auctionpro-client", expiresIn: "30m" });
    return res.status(200).json({ message: "Website verification successful.", token, expiresInSeconds: 1800 });
  } catch (error) { next(error); }
};
