// Single source of truth for the site-OTP settings (used by controller + middleware).
const getSiteOtpEmail = () => String(process.env.SITE_OTP_EMAIL || "hstudy.project@gmail.com").trim().toLowerCase();

const maskEmail = (email) => {
  const [name = "", domain = ""] = String(email).split("@");
  if (!domain) return "your email";
  return `${name.slice(0, 2)}${"*".repeat(Math.max(1, name.length - 2))}@${domain}`;
};

module.exports = {
  getSiteOtpEmail,
  maskEmail,
  OTP_TTL_MS: 5 * 60 * 1000, // OTP valid for 5 minutes
  RESEND_MS: 60 * 1000, // wait 60s before requesting another OTP
  MAX_ATTEMPTS: 5, // wrong guesses allowed per OTP
  sessionMinutes: () => Math.max(1, Number(process.env.SITE_OTP_SESSION_MINUTES) || 30),
};
