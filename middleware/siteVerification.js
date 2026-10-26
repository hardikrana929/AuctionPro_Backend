const jwt = require("jsonwebtoken");

module.exports = function siteVerification(req, res, next) {
  const token = req.get("X-Site-Verification");
  if (!token || !process.env.JWT_SECRET) {
    return res.status(403).json({ message: "Verify the website by email OTP before using AuctionPro." });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { issuer: "auctionpro-api", audience: "auctionpro-client" });
    if (decoded.purpose !== "site-verification" || decoded.email !== (process.env.SITE_OTP_EMAIL || "hstudy.project@gmail.com")) throw new Error("Invalid site verification");
    req.siteVerification = { email: decoded.email };
    next();
  } catch {
    return res.status(403).json({ message: "Website verification is missing or expired. Refresh the page and verify again." });
  }
};
