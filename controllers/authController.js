
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const normalizeUsername = (username) =>
    String(username || "").trim().toLowerCase();

const normalizeAuctionId = (auctionId) =>
    String(auctionId || "").trim().toUpperCase();

const createToken = (user, auctionId = null) => {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured");
    }

    return jwt.sign({ sub: user._id.toString(), role: user.role, ...(auctionId ? { auctionId } : {}), },
        process.env.JWT_SECRET,
        {
            expiresIn: "7d",
            issuer: "auctionpro-api",
            audience: "auctionpro-client",
        }
    );
};

const safeUser = (user) => ({
    id: user._id.toString(),
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    assignedAuctionIds: user.assignedAuctionIds || [],
});

// POST /api/auth/admin/login
//Admin login
const adminLogin = async (req, res, next) => {
    try {
        const username = normalizeUsername(req.body.username);
        const password = req.body.password;

        if (!username || typeof password !== "string" || !password) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required",
            });
        }

        const user = await User.findOne({ username }).select("+passwordHash");

        if (!user || user.role !== "admin" || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials or account unavailable",
            });
        }

        const token = createToken(user);

        return res.status(200).json({
            success: true,
            message: "Admin login successful",
            token,
            user: safeUser(user),
        });
    } catch (error) {
        next(error);
    }
};

// POST /api/auth/user/login
//User Login
const userLogin = async (req, res, next) => {
    try {
        const username = normalizeUsername(req.body.username);
        const password = req.body.password;
        const auctionId = normalizeAuctionId(req.body.auctionId);

        if (!username || typeof password !== "string" || !password || !auctionId) {
            return res.status(400).json({
                success: false,
                message: "Username, password, and Auction ID are required",
            });
        }

        if (auctionId.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Auction ID must contain at least 8 characters",
            });
        }

        const user = await User.findOne({ username }).select("+passwordHash");

        if (
            !user ||
            user.role !== "user" ||
            !user.isActive ||
            !(await bcrypt.compare(password, user.passwordHash))
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials or account unavailable",
            });
        }

        const assignedIds = (user.assignedAuctionIds || []).map(
            normalizeAuctionId
        );

        if (!assignedIds.includes(auctionId)) {
            return res.status(403).json({
                success: false,
                message: "You are not assigned to this auction",
            });
        }

        const token = createToken(user, auctionId);

        return res.status(200).json({
            success: true,
            message: "User login successful",
            token,
            user: { ...safeUser(user), auctionId, },
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/auth/me
//Verify token and get user info
const getMe = async (req, res) => {
    return res.status(200).json({
        success: true,
        user: { ...safeUser(req.user), auctionId: req.authAuctionId || null, },
    });
};

module.exports = {
    adminLogin,
    userLogin,
    getMe,
};
