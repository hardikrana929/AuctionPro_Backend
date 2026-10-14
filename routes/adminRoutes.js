const express = require("express");
const {
    createAuction,
    getAuctions,
    getAuctionById,
    createUser,
    getUsers,
    deleteUser,
    assignUserToAuction,
    removeUserFromAuction,
} = require("../controllers/adminController");

const { protectRoute, adminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

// Every route in this file requires an authenticated Admin.
router.use(protectRoute, adminOnly);

// Auction management
router.post("/auctions", createAuction);
router.get("/auctions", getAuctions);
router.get("/auctions/:auctionId", getAuctionById);

// User management
router.post("/users", createUser);
router.get("/users", getUsers);
router.delete("/users/:userId", deleteUser);

// Assign or remove a user from an auction
router.post(
    "/auctions/:auctionId/assign/:userId",
    assignUserToAuction
);

// Remove a user from an auction
router.delete(
    "/auctions/:auctionId/assign/:userId",
    removeUserFromAuction
);

module.exports = router;
