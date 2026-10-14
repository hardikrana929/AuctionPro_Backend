
const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Player name is required"],
            trim: true,
            minlength: 2,
            maxlength: 100,
        },
        // Structured names are populated by public registration. `name` remains
        // the canonical display name for compatibility with existing auction UI.
        firstName: { type: String, trim: true, maxlength: 50, default: "" },
        lastName: { type: String, trim: true, maxlength: 50, default: "" },
        birthdate: { type: Date, default: null },
        contactNo: { type: String, trim: true, maxlength: 20, default: "" },
        whatsappNo: { type: String, trim: true, maxlength: 20, default: "" },
        villageTown: { type: String, trim: true, maxlength: 100, default: "" },
        registrationSource: { type: String, enum: ["manual", "public-form"], default: "manual" },
        role: {
            type: String,
            required: [true, "Player role is required"],
            enum: [
                "Batsman",
                "Bowler",
                "All-Rounder",
                "Wicket-Keeper",
            ],
        },
        nationality: {
            type: String,
            trim: true,
            maxlength: 60,
            default: "India",
        },
        age: {
            type: Number,
            min: 15,
            max: 60,
            default: null,
        },
        basePrice: {
            type: Number,
            required: [true, "Base price is required"],
            min: 0,
        },
        auctionId: {
            type: String,
            required: [true, "Auction ID is required"],
            trim: true,
            index: true,
        },
        teamId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Team",
            default: null,
        },
        imageUrl: {
            type: String,
            default: "",
        },
        imagePublicId: {
            type: String,
            default: "",
            select: false,
        },
        status: {
            type: String,
            enum: ["available", "sold", "unsold"],
            default: "available",
        },
        soldPrice: {
            type: Number,
            min: 0,
            default: null,
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

playerSchema.index({ auctionId: 1, name: 1 });

module.exports = mongoose.model("Player", playerSchema);
