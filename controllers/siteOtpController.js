const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { getSiteOtpEmail, maskEmail, OTP_TTL_MS, RESEND_MS, MAX_ATTEMPTS, sessionMinutes } = require("../config/siteOtp");

// For multi-instance production deployments, move OTP records to Redis or MongoDB.
const otpStore = new Map();

const hashOtp = (salt, otp) => crypto.createHash("sha256").update(`${salt}:${otp}`).digest("hex");

function getTransport() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    const err = new Error("Email delivery is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM on the backend.");
    err.code = "SMTP_NOT_CONFIGURED";
    throw err;
  }
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE !== undefined ? String(process.env.SMTP_SECURE) === "true" : port === 465;
  // Google shows app passwords as "abcd efgh ijkl mnop" - the spaces are not part of the password.
  const pass = /gmail|google/i.test(SMTP_HOST) ? SMTP_PASS.replace(/\s+/g, "") : SMTP_PASS;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure,
    auth: { user: SMTP_USER, pass },
    // Fail fast so the browser gets a real error instead of hanging until its own timeout
    // (some hosts silently block outbound SMTP ports).
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

// Render (and some other hosts) block outbound SMTP ports. Resend works over HTTPS, so it is used when
// RESEND_API_KEY is set; otherwise we fall back to SMTP (fine for local development).
async function deliver({ to, subject, text, html }) {
  if (process.env.RESEND_API_KEY) {
    const response = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "AuctionPro Security <onboarding@resend.dev>",
        to: [to],
        subject,
        text,
        html,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const err = new Error(`Resend API ${response.status}: ${detail.slice(0, 300)}`);
      err.code = `RESEND_${response.status}`;
      throw err;
    }
    return;
  }
  await getTransport().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text, html });
}

exports.sendOtp = async (req, res) => {
  const email = getSiteOtpEmail();
  const now = Date.now();
  const previous = otpStore.get(email);

  if (previous && now - previous.sentAt < RESEND_MS) {
    const retryAfterSeconds = Math.ceil((RESEND_MS - (now - previous.sentAt)) / 1000);
    res.set("Retry-After", String(retryAfterSeconds));
    return res.status(429).json({
      success: false,
      message: `Please wait ${retryAfterSeconds} seconds before requesting another OTP.`,
      retryAfterSeconds,
    });
  }

  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const salt = crypto.randomBytes(16).toString("hex");
  // Reserve the slot BEFORE the (slow) mail call so two simultaneous requests cannot both send.
  otpStore.set(email, { digest: hashOtp(salt, otp), salt, expiresAt: now + OTP_TTL_MS, sentAt: now, attempts: 0, locked: false });

  try {
    await deliver({
      to: email,
      subject: "Your AuctionPro verification code",
      text: `Your AuctionPro website verification code is ${otp}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#172033"><h2>AuctionPro verification</h2><p>Enter this code to access AuctionPro:</p><div style="font-size:32px;letter-spacing:8px;font-weight:bold;padding:18px;background:#f1f5f9;border-radius:12px;text-align:center">${otp}</div><p>This code expires in 5 minutes. Never share it with anyone.</p></div>`,
    });
  } catch (error) {
    // Mail never left: roll back so the user can retry immediately and no dead OTP stays active.
    if (previous) otpStore.set(email, previous); else otpStore.delete(email);
    console.error("[site-otp] Could not send OTP email:", error.code || "", error.message);
    return res.status(503).json({
      success: false,
      message:
        error.code === "SMTP_NOT_CONFIGURED"
          ? "Email delivery is not configured on the server."
          : "Could not send the verification email. Please try again in a moment.",
      // Safe diagnostic (e.g. ETIMEDOUT, EAUTH, RESEND_403) - visible in the browser's Network tab.
      reason: error.code || error.name || "UNKNOWN",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Verification code sent to the configured email address.",
    email: maskEmail(email),
    expiresInSeconds: OTP_TTL_MS / 1000,
    resendAfterSeconds: RESEND_MS / 1000,
  });
};

exports.verifyOtp = async (req, res, next) => {
  try {
    const email = getSiteOtpEmail();
    const record = otpStore.get(email);
    const otp = String(req.body?.otp ?? "").trim();

    if (!/^\d{6}$/.test(otp)) return res.status(400).json({ success: false, message: "Enter the 6-digit OTP." });
    if (!record || Date.now() > record.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ success: false, message: "OTP expired. Request a new code." });
    }
    if (record.locked || record.attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({ success: false, message: "Too many incorrect attempts. Request a new OTP." });
    }

    const digest = Buffer.from(hashOtp(record.salt, otp));
    const expected = Buffer.from(record.digest);
    if (digest.length !== expected.length || !crypto.timingSafeEqual(digest, expected)) {
      record.attempts += 1;
      if (record.attempts >= MAX_ATTEMPTS) {
        record.locked = true; // keep the record so the 60s resend cooldown still applies
        return res.status(429).json({ success: false, message: "Too many incorrect attempts. Request a new OTP." });
      }
      return res.status(400).json({ success: false, message: `Incorrect OTP. ${MAX_ATTEMPTS - record.attempts} attempts remaining.` });
    }

    otpStore.delete(email); // single use
    const minutes = sessionMinutes();
    const token = jwt.sign({ purpose: "site-verification", email }, process.env.JWT_SECRET, {
      issuer: "auctionpro-api",
      audience: "auctionpro-client",
      expiresIn: `${minutes}m`,
    });
    return res.status(200).json({ success: true, message: "Website verification successful.", token, expiresInSeconds: minutes * 60 });
  } catch (error) {
    next(error);
  }
};
