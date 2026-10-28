const jwt = require("jsonwebtoken");
const { getSiteOtpEmail } = require("../config/siteOtp");

module.exports = function siteVerification(req, res, next) {
  // CORS preflight carries no custom headers; cors() normally answers it first, this is a safety net.
  if (req.method === "OPTIONS") return next();

  const token = req.get("X-Site-Verification");
  if (!token || !process.env.JWT_SECRET) {
    return res.status(403).json({ message: "Verify the website by email OTP before using AuctionPro." });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { issuer: "auctionpro-api", audience: "auctionpro-client" });
    if (decoded.purpose !== "site-verification" || String(decoded.email).toLowerCase() !== getSiteOtpEmail()) {
      throw new Error("Invalid site verification");
    }
    req.siteVerification = { email: decoded.email };
    next();
  } catch {
    return res.status(403).json({ message: "Website verification is missing or expired. Refresh the page and verify again." });
  }
};
