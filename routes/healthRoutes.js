const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

router.get("/", (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;

  res.status(databaseConnected ? 200 : 503).json({
    success: databaseConnected,
    message: databaseConnected
      ? "AuctionPro API and database are ready"
      : "API is running, but the database is disconnected",
    database: databaseConnected ? "connected" : "disconnected",
  });
});

module.exports = router;
