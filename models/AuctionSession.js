const mongoose = require("mongoose");

const auctionSessionSchema = new mongoose.Schema(
  {
    auctionId: { type: String, required: true, unique: true, uppercase: true, trim: true },
    currentPlayerId: { type: mongoose.Schema.Types.ObjectId, ref: "Player", default: null },
    currentBid: { type: Number, min: 0, default: 0 },
    leadingTeamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", default: null },
    status: { type: String, enum: ["idle", "live", "paused", "completed"], default: "idle" },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

module.exports = mongoose.model("AuctionSession", auctionSessionSchema);
