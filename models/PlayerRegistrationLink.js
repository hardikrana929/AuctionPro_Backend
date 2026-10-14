const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  auctionId: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", required: true
  },
  active: {
    type: Boolean,
    default: true
  },
  expiresAt: {
    type: Date,
    default: null
  },
},
  {
    timestamps: true,
    versionKey: false
  });
module.exports = mongoose.model("PlayerRegistrationLink", schema);
