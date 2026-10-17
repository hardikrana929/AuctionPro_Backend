const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    auctionId: { type: String, uppercase: true, trim: true, default: null, index: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    type: { type: String, enum: ["bid", "sold", "unsold", "auction", "feedback"], required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

notificationSchema.index({ recipientId: 1, createdAt: -1 });
module.exports = mongoose.model("Notification", notificationSchema);
