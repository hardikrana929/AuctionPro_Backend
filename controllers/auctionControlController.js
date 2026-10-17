const mongoose = require("mongoose");
const Auction = require("../models/Auction");
const Player = require("../models/Player");
const Team = require("../models/Team");
const Bid = require("../models/Bid");
const AuctionSession = require("../models/AuctionSession");
const Notification = require("../models/Notification");
const User = require("../models/User");

const normalizeId = (value) => String(value || "").trim().toUpperCase();

function ensureAuctionPermission(req, auctionId) {
  if (req.user.role === "admin") return true;
  return normalizeId(req.authAuctionId) === normalizeId(auctionId) &&
    (req.user.assignedAuctionIds || []).some((id) => normalizeId(id) === normalizeId(auctionId));
}

async function notifyAuction(req, auctionId, type, title, message) {
  const normalizedAuctionId = normalizeId(auctionId);
  const assignedUsers = await User.find({ role: "user", isActive: true, assignedAuctionIds: normalizedAuctionId }).select("_id").lean();
  const notifications = await Notification.create([
    { auctionId: normalizedAuctionId, type, title, message },
    ...assignedUsers.map((user) => ({ recipientId: user._id, auctionId: normalizedAuctionId, type, title, message })),
  ]);
  const io = req.app.get("io");
  if (io) {
    io.to(`auction:${normalizedAuctionId}`).emit("notification:new", notifications[0].toObject());
    io.to("admins").emit("notification:new", notifications[0].toObject());
    notifications.slice(1).forEach((notification) => io.to(`user:${notification.recipientId}`).emit("notification:new", notification.toObject()));
  }
  return notifications[0];
}

async function getSession(auctionId) {
  let session = await AuctionSession.findOne({ auctionId: normalizeId(auctionId) });
  if (!session) session = await AuctionSession.create({ auctionId: normalizeId(auctionId) });
  return session;
}

exports.getState = async (req, res, next) => {
  try {
    const auctionId = normalizeId(req.params.auctionId || req.authAuctionId);
    if (!ensureAuctionPermission(req, auctionId)) return res.status(403).json({ success: false, message: "Auction access denied." });
    const auction = await Auction.findOne({ auctionId }).lean();
    if (!auction) return res.status(404).json({ success: false, message: "Auction not found." });
    const session = await getSession(auctionId);
    const [player, teams, bids, players] = await Promise.all([
      session.currentPlayerId ? Player.findById(session.currentPlayerId).populate("teamId", "name shortName").lean() : null,
      Team.find({ auctionId }).sort({ name: 1 }).lean(),
      session.currentPlayerId ? Bid.find({ auctionId, playerId: session.currentPlayerId }).sort({ createdAt: -1 }).limit(20).populate("teamId", "name shortName").populate("placedBy", "username").lean() : [],
      Player.find({ auctionId, status: "available" }).sort({ createdAt: 1 }).select("_id name role basePrice imageUrl status").lean(),
    ]);
    const sold = await Player.find({ auctionId, status: "sold" }).select("teamId soldPrice").lean();
    const teamSummaries = teams.map((team) => {
      const purchases = sold.filter((player) => String(player.teamId) === String(team._id));
      const spent = purchases.reduce((sum, player) => sum + Number(player.soldPrice || 0), 0);
      return { ...team, spent, remainingBudget: Math.max(0, auction.startingBudget - spent), playersBought: purchases.length };
    });
    return res.json({ success: true, auction, session, currentPlayer: player, teams: teamSummaries, bids, availablePlayers: players });
  } catch (error) { next(error); }
};

exports.startAuction = async (req, res, next) => {
  try {
    const auctionId = normalizeId(req.params.auctionId);
    if (!ensureAuctionPermission(req, auctionId)) return res.status(403).json({ success: false, message: "Auction access denied." });
    if (req.user.role !== "admin") return res.status(403).json({ success: false, message: "Only an admin can start or stop live bidding." });
    const auction = await Auction.findOne({ auctionId });
    if (!auction) return res.status(404).json({ success: false, message: "Auction not found." });
    if (["completed", "archived"].includes(auction.status)) return res.status(409).json({ success: false, message: "This auction is closed." });
    const teams = await Team.countDocuments({ auctionId });
    if (teams < 2) return res.status(409).json({ success: false, message: "Add at least two teams before starting bidding." });
    auction.status = "active";
    await auction.save();
    const session = await getSession(auctionId);
    session.status = "live";
    session.startedAt = session.startedAt || new Date();
    await session.save();
    await notifyAuction(req, auctionId, "auction", "Auction started", `${auction.name} is now live.`);
    const io = req.app.get("io");
    if (io) io.to(`auction:${auctionId}`).emit("auction:state", { auctionId, status: "live" });
    return res.json({ success: true, message: "Auction started.", session });
  } catch (error) { next(error); }
};

exports.pauseAuction = async (req, res, next) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ success: false, message: "Only an admin can pause bidding." });
    const auctionId = normalizeId(req.params.auctionId);
    const session = await AuctionSession.findOne({ auctionId });
    if (!session || session.status !== "live") return res.status(409).json({ success: false, message: "Auction is not currently live." });
    session.status = "paused";
    await session.save();
    const auction = await Auction.findOne({ auctionId });
    if (auction) { auction.status = "paused"; await auction.save(); }
    await notifyAuction(req, auctionId, "auction", "Auction paused", "Live bidding has been paused by the administrator.");
    const io = req.app.get("io");
    if (io) io.to(`auction:${auctionId}`).emit("auction:state", { auctionId, status: "paused" });
    return res.json({ success: true, session });
  } catch (error) { next(error); }
};

exports.selectNextPlayer = async (req, res, next) => {
  try {
    const auctionId = normalizeId(req.params.auctionId);
    if (req.user.role !== "admin") return res.status(403).json({ success: false, message: "Only an admin can select the next player." });
    const session = await getSession(auctionId);
    if (session.status !== "live") return res.status(409).json({ success: false, message: "Start the auction before selecting players." });
    if (session.currentPlayerId) return res.status(409).json({ success: false, message: "Complete the current player as sold or unsold first." });
    const player = await Player.findOne({ auctionId, status: "available" }).sort({ createdAt: 1 });
    if (!player) {
      session.status = "completed";
      session.completedAt = new Date();
      await session.save();
      const auction = await Auction.findOne({ auctionId });
      if (auction) { auction.status = "completed"; await auction.save(); }
      await notifyAuction(req, auctionId, "auction", "Auction completed", "There are no available players remaining.");
      return res.json({ success: true, message: "All players have been processed. Auction completed.", session });
    }
    session.currentPlayerId = player._id;
    session.currentBid = Number(player.basePrice || 0);
    session.leadingTeamId = null;
    await session.save();
    const io = req.app.get("io");
    if (io) io.to(`auction:${auctionId}`).emit("player:current", { auctionId, playerId: String(player._id) });
    return res.json({ success: true, session, player });
  } catch (error) { next(error); }
};

exports.placeBid = async (req, res, next) => {
  try {
    const auctionId = normalizeId(req.params.auctionId);
    if (!ensureAuctionPermission(req, auctionId)) return res.status(403).json({ success: false, message: "Auction access denied." });
    if (req.user.role !== "user") return res.status(403).json({ success: false, message: "Place bids from an assigned auction user account." });
    const { teamId, amount } = req.body;
    if (!mongoose.isValidObjectId(teamId)) return res.status(400).json({ success: false, message: "Select a valid team." });
    if (!Number.isSafeInteger(Number(amount)) || Number(amount) < 1) return res.status(400).json({ success: false, message: "Bid must be a positive whole number." });
    const [auction, session, team] = await Promise.all([
      Auction.findOne({ auctionId }), AuctionSession.findOne({ auctionId }), Team.findOne({ _id: teamId, auctionId }),
    ]);
    if (!auction || !session) return res.status(404).json({ success: false, message: "Auction session not found." });
    if (auction.status !== "active" || session.status !== "live") return res.status(409).json({ success: false, message: "Bidding is not live." });
    if (!session.currentPlayerId) return res.status(409).json({ success: false, message: "The auctioneer has not selected a player yet." });
    if (!team) return res.status(400).json({ success: false, message: "That team does not belong to this auction." });
    const player = await Player.findOne({ _id: session.currentPlayerId, auctionId, status: "available" });
    if (!player) return res.status(409).json({ success: false, message: "Current player is no longer available." });
    const latestBid = await Bid.findOne({ auctionId, playerId: player._id }).sort({ amount: -1, createdAt: -1 });
    const minimumNextBid = latestBid ? latestBid.amount + auction.bidIncrement : player.basePrice;
    if (Number(amount) !== minimumNextBid) return res.status(409).json({ success: false, message: `Next valid bid is ₹${minimumNextBid.toLocaleString("en-IN")}.`, minimumNextBid });
    if (String(session.leadingTeamId || "") === String(team._id)) return res.status(409).json({ success: false, message: "The leading team cannot bid against itself." });
    const soldPlayers = await Player.find({ auctionId, status: "sold", teamId: team._id }).select("soldPrice").lean();
    const spent = soldPlayers.reduce((sum, item) => sum + Number(item.soldPrice || 0), 0);
    const remaining = auction.startingBudget - spent;
    const rosterCount = soldPlayers.length;
    if (rosterCount >= auction.maxPlayersPerTeam) return res.status(409).json({ success: false, message: "This team has reached its player limit." });
    if (remaining < Number(amount)) return res.status(409).json({ success: false, message: "This team does not have enough remaining budget." });
    if (remaining - Number(amount) < (auction.maxPlayersPerTeam - rosterCount - 1) * auction.minimumBid) return res.status(409).json({ success: false, message: "This bid would leave insufficient budget to fill the remaining squad slots." });
    let bid;
    try {
      bid = await Bid.create({ auctionId, playerId: player._id, teamId: team._id, amount: Number(amount), placedBy: req.user._id });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ success: false, message: "Another bid was accepted first. Refresh and use the new minimum bid." });
      throw error;
    }
    session.currentBid = Number(amount);
    session.leadingTeamId = team._id;
    await session.save();
    await notifyAuction(req, auctionId, "bid", "New bid placed", `${team.name} bid ₹${Number(amount).toLocaleString("en-IN")} for ${player.name}.`);
    const io = req.app.get("io");
    if (io) io.to(`auction:${auctionId}`).emit("bid:new", { bid: { ...bid.toObject(), team, player }, session: session.toObject() });
    return res.status(201).json({ success: true, message: "Bid accepted.", bid, session, minimumNextBid: Number(amount) + auction.bidIncrement });
  } catch (error) { next(error); }
};

async function completeCurrent(req, res, next, sold) {
  try {
    const auctionId = normalizeId(req.params.auctionId);
    if (req.user.role !== "admin") return res.status(403).json({ success: false, message: "Only an admin can complete a player." });
    const session = await AuctionSession.findOne({ auctionId });
    if (!session?.currentPlayerId || session.status !== "live") return res.status(409).json({ success: false, message: "There is no active player to complete." });
    const player = await Player.findOne({ _id: session.currentPlayerId, auctionId, status: "available" });
    if (!player) return res.status(404).json({ success: false, message: "Current player not found." });
    let team = null;
    if (sold) {
      if (!session.leadingTeamId) return res.status(409).json({ success: false, message: "A player can only be sold after a valid bid." });
      team = await Team.findOne({ _id: session.leadingTeamId, auctionId });
      if (!team) return res.status(409).json({ success: false, message: "Leading team no longer exists." });
      player.status = "sold";
      player.teamId = team._id;
      player.soldPrice = session.currentBid;
    } else {
      player.status = "unsold";
      player.teamId = null;
      player.soldPrice = null;
    }
    await player.save();
    session.currentPlayerId = null;
    session.currentBid = 0;
    session.leadingTeamId = null;
    await session.save();
    const eventType = sold ? "sold" : "unsold";
    const message = sold ? `${player.name} sold to ${team.name} for ₹${Number(player.soldPrice).toLocaleString("en-IN")}.` : `${player.name} was marked unsold.`;
    await notifyAuction(req, auctionId, eventType, sold ? "Player sold" : "Player unsold", message);
    const io = req.app.get("io");
    if (io) io.to(`auction:${auctionId}`).emit(sold ? "player:sold" : "player:unsold", { auctionId, player: player.toObject(), team, session: session.toObject() });
    return res.json({ success: true, message, player, team, session });
  } catch (error) { next(error); }
}
exports.markSold = (req, res, next) => completeCurrent(req, res, next, true);
exports.markUnsold = (req, res, next) => completeCurrent(req, res, next, false);

exports.getHistory = async (req, res, next) => {
  try {
    const auctionId = normalizeId(req.params.auctionId || req.authAuctionId);
    if (!ensureAuctionPermission(req, auctionId)) return res.status(403).json({ success: false, message: "Auction access denied." });
    const [bids, sold, unsold] = await Promise.all([
      Bid.find({ auctionId }).sort({ createdAt: -1 }).limit(100).populate("playerId", "name imageUrl role").populate("teamId", "name shortName").populate("placedBy", "username").lean(),
      Player.find({ auctionId, status: "sold" }).populate("teamId", "name shortName").sort({ updatedAt: -1 }).lean(),
      Player.find({ auctionId, status: "unsold" }).sort({ updatedAt: -1 }).lean(),
    ]);
    return res.json({ success: true, bids, sold, unsold });
  } catch (error) { next(error); }
};
