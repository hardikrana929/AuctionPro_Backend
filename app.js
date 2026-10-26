
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const healthRoutes = require("./routes/healthRoutes");
const notFoundMiddleware = require("./middleware/notFoundMiddleware");
const errorMiddleware = require("./middleware/errorMiddleware");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const teamRoutes = require("./routes/teamRoutes");
const playerRoutes = require("./routes/playerRoutes");
const userRoutes = require("./routes/userRoutes");
const userTeamRoutes = require("./routes/userTeamRoutes");
const userPlayerRoutes = require("./routes/userPlayerRoutes");
const playerRegistrationRoutes = require("./routes/playerRegistrationRoutes");
const auctionControlRoutes = require("./routes/auctionControlRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const siteOtpRoutes = require("./routes/siteOtpRoutes");
const siteVerification = require("./middleware/siteVerification");

const app = express();

app.disable("x-powered-by");

// Behind Render/Railway/Vercel proxies, req.ip must come from X-Forwarded-For,
// otherwise every visitor shares one rate-limit bucket (and OTP requests get blocked for all).
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
}

app.use(helmet());

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://auction-pro-frontend.vercel.app",
  ...(process.env.CLIENT_URL || "").split(",").map((value) => value.trim()).filter(Boolean),
]);

app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin header are typically server-to-server or CLI requests.
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Site-Verification"],
    optionsSuccessStatus: 204,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1500,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", apiLimiter);

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to AuctionPro API",
  });
});

app.use("/api/site-otp", siteOtpRoutes);
app.use("/api/health", healthRoutes);
// Every application API below this line requires successful site-wide email OTP verification.
app.use("/api", siteVerification);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/user/teams", userTeamRoutes);
app.use("/api/user/players", userPlayerRoutes);
app.use("/api/player-registration", playerRegistrationRoutes);
app.use("/api/auction-control", auctionControlRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/teams", teamRoutes);
app.use("/api/admin/players", playerRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
