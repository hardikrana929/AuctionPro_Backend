const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const Auction = require("../models/Auction");
const User = require("../models/User");

// Generate an Auction ID such as AUC-7F2A91BC40
function generateAuctionId() {
    return `AUC-${crypto.randomBytes(5).toString("hex").toUpperCase()} `;
}

// POST /api/admin/auctions
// Create a new auction
exports.createAuction = async (req, res, next) => {
    try {
        const {
            name,
            description = "",
            auctionDate,
            startingBudget,
            minimumBid,
            bidIncrement,
            maxTeams,
            maxPlayersPerTeam,
        } = req.body;

        if (!name || name.trim().length < 3) {
            return res.status(400).json({
                success: false,
                message: "Auction name must contain at least 3 characters",
            });
        }

        const numericFields = {
            startingBudget,
            minimumBid,
            bidIncrement,
            maxTeams,
            maxPlayersPerTeam,
        };

        for (const [field, value] of Object.entries(numericFields)) {
            if (
                value === undefined ||
                value === null ||
                value === "" ||
                !Number.isFinite(Number(value))
            ) {
                return res.status(400).json({
                    success: false,
                    message: `${field} must be a valid number`,
                });
            }
        }

        const budget = Number(startingBudget);
        const minBid = Number(minimumBid);
        const increment = Number(bidIncrement);
        const teams = Number(maxTeams);
        const players = Number(maxPlayersPerTeam);

        if (budget < 1 || minBid < 1 || increment < 1) {
            return res.status(400).json({
                success: false,
                message: "Budget, minimum bid, and bid increment must be positive",
            });
        }

        if (minBid > budget) {
            return res.status(400).json({
                success: false,
                message: "Minimum bid cannot exceed the starting budget",
            });
        }

        if (
            !Number.isInteger(teams) ||
            teams < 2 ||
            teams > 100 ||
            !Number.isInteger(players) ||
            players < 1 ||
            players > 100
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Maximum teams must be an integer from 2 to 100, and players per team must be an integer from 1 to 100",
            });
        }

        let parsedDate = null;

        if (auctionDate) {
            parsedDate = new Date(auctionDate);

            if (Number.isNaN(parsedDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid auction date",
                });
            }
        }

        // Retry if the randomly generated ID happens to exist already.
        let auction = null;

        for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
                auction = await Auction.create({
                    name: name.trim(),
                    description,
                    auctionId: generateAuctionId(),
                    createdBy: req.user._id,
                    auctionDate: parsedDate,
                    startingBudget: budget,
                    minimumBid: minBid,
                    bidIncrement: increment,
                    maxTeams: teams,
                    maxPlayersPerTeam: players,
                    status: "draft",
                });

                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 4) {
                    continue;
                }

                throw error;
            }
        }

        return res.status(201).json({
            success: true,
            message: "Auction created successfully",
            auction,
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/admin/auctions
// Retrieve all auctions
exports.getAuctions = async (req, res, next) => {
    try {
        const auctions = await Auction.find()
            .populate("createdBy", "username")
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            count: auctions.length,
            auctions,
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/admin/auctions/:auctionId
// Retrieve a specific auction by its ID
exports.getAuctionById = async (req, res, next) => {
    try {
        const auctionId = req.params.auctionId.trim().toUpperCase();

        const auction = await Auction.findOne({ auctionId })
            .populate("createdBy", "username")
            .lean();

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        return res.status(200).json({
            success: true,
            auction,
        });
    } catch (error) {
        next(error);
    }
};

// POST /api/admin/users
// Create a new user account
exports.createUser = async (req, res, next) => {
    try {
        const { username, password } = req.body;

        if (
            typeof username !== "string" ||
            username.trim().length < 3 ||
            username.trim().length > 50
        ) {
            return res.status(400).json({
                success: false,
                message: "Username must be between 3 and 50 characters",
            });
        }

        if (
            typeof password !== "string" ||
            password.length < 12 ||
            password.length > 128
        ) {
            return res.status(400).json({
                success: false,
                message: "Password must be between 12 and 128 characters",
            });
        }

        const normalizedUsername = username.trim().toLowerCase();

        const existingUser = await User.findOne({
            username: normalizedUsername,
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "This username is already taken",
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const user = await User.create({
            username: normalizedUsername,
            passwordHash,
            role: "user",
            isActive: true,
            assignedAuctionIds: [],
        });

        return res.status(201).json({
            success: true,
            message: "User account created successfully",
            user: {
                _id: user._id,
                username: user.username,
                role: user.role,
                isActive: user.isActive,
                assignedAuctionIds: user.assignedAuctionIds,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "This username is already taken",
            });
        }

        next(error);
    }
};

// GET /api/admin/users
// Retrieve all user accounts
exports.getUsers = async (req, res, next) => {
    try {
        const users = await User.find({ role: "user" })
            .select("username role isActive assignedAuctionIds createdAt")
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            count: users.length,
            users,
        });
    } catch (error) {
        next(error);
    }
};

// POST /api/admin/auctions/:auctionId/assign/:userId
// Assign a user to an auction
exports.assignUserToAuction = async (req, res, next) => {
    try {
        const auctionId = req.params.auctionId.trim().toUpperCase();
        const { userId } = req.params;

        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID",
            });
        }

        const [auction, user] = await Promise.all([
            Auction.findOne({ auctionId }),
            User.findById(userId),
        ]);

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        if (!user || user.role !== "user") {
            return res.status(404).json({
                success: false,
                message: "User account not found",
            });
        }

        if (!user.isActive) {
            return res.status(400).json({
                success: false,
                message: "Cannot assign an inactive user",
            });
        }

        // Each auction may be assigned to only one user at a time.
        const existingAssignee = await User.findOne({
            _id: { $ne: user._id },
            role: "user",
            assignedAuctionIds: auction.auctionId,
        }).select("username");

        if (existingAssignee) {
            return res.status(409).json({
                success: false,
                message: `This auction is already assigned to ${existingAssignee.username}. Remove that assignment first.`,
            });
        }

        if (user.assignedAuctionIds.includes(auction.auctionId)) {
            return res.status(409).json({
                success: false,
                message: "User is already assigned to this auction",
            });
        }

        user.assignedAuctionIds.push(auction.auctionId);
        await user.save();

        return res.status(200).json({
            success: true,
            message: "User assigned to auction successfully",
            assignment: {
                userId: user._id,
                username: user.username,
                auctionId: auction.auctionId,
                auctionName: auction.name,
            },
        });
    } catch (error) {
        next(error);
    }
};

// DELETE /api/admin/auctions/:auctionId/assign/:userId
// Remove a user from an auction
exports.removeUserFromAuction = async (req, res, next) => {
    try {
        const auctionId = req.params.auctionId.trim().toUpperCase();
        const { userId } = req.params;

        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID",
            });
        }

        const [auction, user] = await Promise.all([
            Auction.findOne({ auctionId }),
            User.findById(userId),
        ]);

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        if (!user || user.role !== "user") {
            return res.status(404).json({
                success: false,
                message: "User account not found",
            });
        }

        if (!user.assignedAuctionIds.includes(auction.auctionId)) {
            return res.status(404).json({
                success: false,
                message: "User is not assigned to this auction",
            });
        }

        user.assignedAuctionIds = user.assignedAuctionIds.filter(
            (id) => id !== auction.auctionId
        );

        await user.save();

        return res.status(200).json({
            success: true,
            message: "User removed from auction successfully",
        });
    } catch (error) {
        next(error);
    }
};


/**
 * DELETE /api/admin/users/:userId
 * Delete a user account. Admin accounts cannot be deleted through this endpoint.
 */
exports.deleteUser = async (req, res, next) => {
    try {
        const { userId } = req.params;

        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({ success: false, message: "Invalid user ID" });
        }

        const user = await User.findOne({ _id: userId, role: "user" });

        if (!user) {
            return res.status(404).json({ success: false, message: "User account not found" });
        }

        await User.deleteOne({ _id: user._id, role: "user" });

        return res.status(200).json({
            success: true,
            message: `User "${user.username}" was deleted successfully.`,
            deletedUserId: user._id,
        });
    } catch (error) {
        next(error);
    }
};
