const mongoose = require("mongoose");

const auctionSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Auction name is required"],
            trim: true,
            minlength: 3,
            maxlength: 100,
        },

        description: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },

        auctionId: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
            minlength: 8,
            maxlength: 30,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // One auction can have at most one assigned Admin account.
        assignedUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },

        auctionDate: {
            type: Date,
            default: null,
        },

        status: {
            type: String,
            enum: ["draft", "active", "paused", "completed", "archived"],
            default: "draft",
        },

        startingBudget: {
            type: Number,
            required: true,
            min: 1,
        },

        minimumBid: {
            type: Number,
            required: true,
            min: 1,
        },

        bidIncrement: {
            type: Number,
            required: true,
            min: 1,
        },

        maxTeams: {
            type: Number,
            required: true,
            min: 2,
            max: 100,
            validate: {
                validator: Number.isInteger,
                message: "Maximum teams must be an integer",
            },
        },

        maxPlayersPerTeam: {
            type: Number,
            required: true,
            min: 1,
            max: 100,
            validate: {
                validator: Number.isInteger,
                message: "Maximum players per team must be an integer",
            },
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

module.exports = mongoose.model("Auction", auctionSchema);
