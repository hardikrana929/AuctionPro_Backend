const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 50,
    },

    passwordHash: {
      type: String,
      required: [true, "Password hash is required"],
      select: false,
    },

    role: {
      type: String,
      enum: ["admin", "user"],
      required: true,
      default: "user",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // Stores public Auction IDs, not MongoDB document IDs.
    // Group 3 will use these IDs when creating assignments.
    assignedAuctionIds: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// userSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.model("User", userSchema);
