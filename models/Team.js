
const mongoose = require("mongoose");

const teamSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Team name is required"],
            trim: true,
            minlength: 2,
            maxlength: 80,
        },
        shortName: {
            type: String,
            required: [true, "Team short name is required"],
            trim: true,
            uppercase: true,
            minlength: 2,
            maxlength: 10,
        },
        auctionId: {
            type: String,
            required: [true, "Auction ID is required"],
            trim: true,
            index: true,
        },
        logoUrl: {
            type: String,
            default: "",
        },
        logoPublicId: {
            type: String,
            default: "",
            select: false,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    },
);

teamSchema.index({ auctionId: 1, name: 1 }, { unique: true });
teamSchema.index({ auctionId: 1, shortName: 1 }, { unique: true });

module.exports = mongoose.model("Team", teamSchema);
