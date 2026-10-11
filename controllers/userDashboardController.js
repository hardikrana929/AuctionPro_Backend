const Auction = require("../models/Auction");
const Team = require("../models/Team");
const Player = require("../models/Player");

exports.getUserDashboard = async (req, res, next) => {
  try {
    const auctionId = String(req.authAuctionId || "").trim().toUpperCase();
    if (!auctionId) {
      return res.status(403).json({ success: false, message: "No auction is selected for this session" });
    }

    const auction = await Auction.findOne({ auctionId }).lean();
    if (!auction) {
      return res.status(404).json({ success: false, message: "Assigned auction was not found" });
    }

    const [teams, players, playerCounts] = await Promise.all([
      Team.find({ auctionId }).select("name shortName logoUrl auctionId createdAt").sort({ name: 1 }).lean(),
      Player.find({ auctionId }).select("name role nationality age basePrice teamId imageUrl status soldPrice auctionId").populate("teamId", "name shortName logoUrl").sort({ name: 1 }).limit(200).lean(),
      Player.aggregate([
        { $match: { auctionId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const counts = { available: 0, sold: 0, unsold: 0 };
    playerCounts.forEach((item) => { counts[item._id] = item.count; });

    return res.json({
      success: true,
      auction: {
        name: auction.name,
        auctionId: auction.auctionId,
        description: auction.description,
        auctionDate: auction.auctionDate,
        status: auction.status,
        startingBudget: auction.startingBudget,
        minimumBid: auction.minimumBid,
        bidIncrement: auction.bidIncrement,
        maxTeams: auction.maxTeams,
        maxPlayersPerTeam: auction.maxPlayersPerTeam,
      },
      stats: { teamCount: teams.length, playerCount: players.length, ...counts },
      teams,
      players,
    });
  } catch (error) {
    next(error);
  }
};
