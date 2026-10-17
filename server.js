require("dotenv").config();

const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const attachSocket = require("./config/socket");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    const server = http.createServer(app);
    const io = attachSocket(server);
    app.set("io", io);

    server.listen(PORT, () => {
      console.log(`AuctionPro API running at http://localhost:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    console.error("Failed to start AuctionPro:", error.message);
    process.exit(1);
  }
};

startServer();
