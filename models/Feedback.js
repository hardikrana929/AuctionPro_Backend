const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    auctionId: { type: String, uppercase: true, trim: true, default: null, index: true },
    category: { type: String, enum: ["Bug report", "Suggestion", "Auction experience", "Other"], default: "Other" },
    rating: { type: Number, min: 1, max: 5, default: 5 },
    message: { type: String, required: true, trim: true, minlength: 5, maxlength: 2000 },
    status: { type: String, enum: ["New", "In Review", "Resolved"], default: "New" },
    adminResponse: { type: String, trim: true, maxlength: 2000, default: "" },
  },
  { timestamps: true, versionKey: false },
);

module.exports = mongoose.model("Feedback", feedbackSchema);
