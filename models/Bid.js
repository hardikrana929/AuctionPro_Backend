const mongoose = require("mongoose");

const bidSchema = new mongoose.Schema(
  {
    auctionId: { type: String, required: true, uppercase: true, trim: true, index: true },
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: "Player", required: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    amount: { type: Number, required: true, min: 1 },
    placedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, versionKey: false },
);

bidSchema.index({ auctionId: 1, playerId: 1, createdAt: -1 });
bidSchema.index({ auctionId: 1, playerId: 1, amount: 1 }, { unique: true });
module.exports = mongoose.model("Bid", bidSchema);
