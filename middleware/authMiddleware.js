
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protectRoute = async (req, res, next) => {
    try {
        const authorization = req.headers.authorization;

        if (!authorization || !authorization.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        const token = authorization.slice(7).trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is not configured");
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            issuer: "auctionpro-api",
            audience: "auctionpro-client",
        });

        const user = await User.findById(decoded.sub);

        if (!user || !user.isActive || user.role !== decoded.role) {
            return res.status(401).json({
                success: false,
                message: "Account unavailable or session invalid",
            });
        }

        // A User's token is tied to the auction selected at login.
        if (
            user.role === "user" &&
            (!decoded.auctionId ||
                !(user.assignedAuctionIds || []).some(
                    (id) =>
                        String(id).trim().toUpperCase() ===
                        String(decoded.auctionId).trim().toUpperCase()
                ))
        ) {
            return res.status(403).json({
                success: false,
                message: "Auction access denied",
            });
        }

        req.user = user;
        req.authAuctionId = decoded.auctionId || null;

        next();
    } catch (error) {
        if (
            error.name === "JsonWebTokenError" ||
            error.name === "TokenExpiredError" ||
            error.name === "NotBeforeError"
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token",
            });
        }

        next(error);
    }
};

const adminOnly = (req, res, next) => {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Admin access required",
        });
    }

    next();
};

const requireAuctionAccess = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        // Admins can access any auction. Auction-specific existence
        // and business rules will be checked in Group 3.
        if (req.user.role === "admin") {
            return next();
        }

        const requestedAuctionId = String(
            req.params.auctionId || req.authAuctionId || ""
        )
            .trim()
            .toUpperCase();

        const assigned = (req.user.assignedAuctionIds || []).some(
            (id) => String(id).trim().toUpperCase() === requestedAuctionId
        );

        if (!assigned || requestedAuctionId !== req.authAuctionId) {
            return res.status(403).json({
                success: false,
                message: "You do not have access to this auction",
            });
        }

        // The permission parameter will be enforced through the
        // assignment permissions implemented in Group 3.
        req.auctionPermission = permission;

        next();
    };
};

module.exports = {
    protectRoute,
    adminOnly,
    requireAuctionAccess,
};
