const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

function attachSocket(server) {
  const allowedOrigins = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://auction-pro-frontend.vercel.app",
    ...(process.env.CLIENT_URL || "").split(",").map((value) => value.trim()).filter(Boolean),
  ]);
  const io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        return callback(new Error("Socket.IO CORS origin not allowed"));
      },
      methods: ["GET", "POST"],
    },
  });

  io.use(async (socket, next) => {
    try {
      const siteToken = socket.handshake.auth?.siteVerificationToken;
      if (!siteToken || !process.env.JWT_SECRET) return next(new Error("Website email verification required"));
      const siteDecoded = jwt.verify(siteToken, process.env.JWT_SECRET, { issuer: "auctionpro-api", audience: "auctionpro-client" });
      if (siteDecoded.purpose !== "site-verification" || siteDecoded.email !== (process.env.SITE_OTP_EMAIL || "hstudy.project@gmail.com")) return next(new Error("Website verification invalid"));
      const token = socket.handshake.auth?.token;
      if (!token || !process.env.JWT_SECRET) return next(new Error("Authentication required"));
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        issuer: "auctionpro-api",
        audience: "auctionpro-client",
      });
      const user = await User.findById(decoded.sub).select("role isActive assignedAuctionIds").lean();
      if (!user || !user.isActive || user.role !== decoded.role) return next(new Error("Invalid session"));
      if (user.role === "user" && !user.assignedAuctionIds.some((id) => String(id).toUpperCase() === String(decoded.auctionId || "").toUpperCase())) {
        return next(new Error("Auction access denied"));
      }
      socket.data.user = { id: String(user._id), role: user.role, auctionId: decoded.auctionId || null };
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);
    if (user.role === "admin") socket.join("admins");
    if (user.role === "user" && user.auctionId) socket.join(`auction:${String(user.auctionId).toUpperCase()}`);

    socket.on("auction:join", async (requestedAuctionId) => {
      const auctionId = String(requestedAuctionId || "").trim().toUpperCase();
      if (!auctionId) return;
      if (user.role !== "admin" && auctionId !== String(user.auctionId || "").toUpperCase()) return;
      socket.join(`auction:${auctionId}`);
    });
  });

  return io;
}

module.exports = attachSocket;
