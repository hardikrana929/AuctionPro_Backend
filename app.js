
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

const app = express();

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
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

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/user/teams", userTeamRoutes);
app.use("/api/user/players", userPlayerRoutes);
app.use("/api/player-registration", playerRegistrationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/teams", teamRoutes);
app.use("/api/admin/players", playerRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
