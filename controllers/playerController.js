const mongoose = require("mongoose");
const Player = require("../models/Player");
const Team = require("../models/Team");
const Auction = require("../models/Auction");
const { uploadImage, deleteImage } = require("../config/cloudinary");

const PLAYER_ROLES = ["Batsman", "Bowler", "All-Rounder", "Wicket-Keeper"];
const PLAYER_STATUSES = ["available", "sold", "unsold"];

function normalizeAuctionId(value) {
  return String(value || "").trim().toUpperCase();
}

function validImageSignature(file) {
  if (!file?.buffer) return false;
  const b = file.buffer;
  if (file.mimetype === "image/jpeg") {
    return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  }
  if (file.mimetype === "image/png") {
    return b.length > 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (file.mimetype === "image/webp") {
    return b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
  }
  return false;
}

function parseOptionalAge(value) {
  if (value === undefined || value === null || value === "") return null;
  const age = Number(value);
  return Number.isInteger(age) && age >= 15 && age <= 60 ? age : NaN;
}

exports.getPlayers = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.auctionId) filter.auctionId = normalizeAuctionId(req.query.auctionId);
    if (req.query.status && PLAYER_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (req.query.role && PLAYER_ROLES.includes(req.query.role)) {
      filter.role = req.query.role;
    }
    if (req.query.search) {
      const search = String(req.query.search).trim().slice(0, 80);
      if (search) filter.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }

    const players = await Player.find(filter)
      .select("-imagePublicId")
      .populate("teamId", "name shortName logoUrl")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, count: players.length, players });
  } catch (error) {
    next(error);
  }
};

exports.getPlayerById = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.playerId)) {
      return res.status(400).json({ success: false, message: "Invalid player ID" });
    }
    const player = await Player.findById(req.params.playerId)
      .select("-imagePublicId")
      .populate("teamId", "name shortName logoUrl")
      .lean();
    if (!player) return res.status(404).json({ success: false, message: "Player not found" });
    res.json({ success: true, player });
  } catch (error) {
    next(error);
  }
};

exports.createPlayer = async (req, res, next) => {
  let uploaded = null;
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const role = String(req.body.role || "");
    const nationality = String(req.body.nationality || "India").trim();
    const auctionId = normalizeAuctionId(req.body.auctionId);
    const basePrice = Number(req.body.basePrice);
    const age = parseOptionalAge(req.body.age);

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({ success: false, message: "Player name must be between 2 and 100 characters" });
    }
    if (!PLAYER_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: "Select a valid player role" });
    }
    if (!auctionId) return res.status(400).json({ success: false, message: "Auction ID is required" });
    if (!Number.isSafeInteger(basePrice) || basePrice < 0) {
      return res.status(400).json({ success: false, message: "Base price must be a non-negative whole number" });
    }
    if (Number.isNaN(age)) return res.status(400).json({ success: false, message: "Age must be between 15 and 60" });
    if (nationality.length > 60) return res.status(400).json({ success: false, message: "Nationality must not exceed 60 characters" });

    const auction = await Auction.findOne({ auctionId });
    if (!auction) return res.status(404).json({ success: false, message: "Auction not found" });

    let teamId = null;
    if (req.body.teamId) {
      if (!mongoose.isValidObjectId(req.body.teamId)) {
        return res.status(400).json({ success: false, message: "Invalid team selection" });
      }
      const team = await Team.findOne({ _id: req.body.teamId, auctionId });
      if (!team) return res.status(400).json({ success: false, message: "Selected team does not belong to this auction" });
      teamId = team._id;
    }

    if (req.file) {
      if (!validImageSignature(req.file)) {
        return res.status(400).json({ success: false, message: "Uploaded file is not a valid JPEG, PNG, or WebP image" });
      }
      uploaded = await uploadImage(req.file.buffer, "player-photos");
    }

    const player = await Player.create({
      name,
      role,
      nationality,
      age,
      basePrice,
      auctionId,
      teamId,
      imageUrl: uploaded?.secure_url || "",
      imagePublicId: uploaded?.public_id || "",
      createdBy: req.user._id,
      status: "available",
    });

    const result = await Player.findById(player._id)
      .select("-imagePublicId")
      .populate("teamId", "name shortName logoUrl")
      .lean();

    res.status(201).json({ success: true, message: "Player created successfully", player: result });
  } catch (error) {
    if (uploaded?.public_id) await deleteImage(uploaded.public_id).catch(() => {});
    next(error);
  }
};

exports.updatePlayer = async (req, res, next) => {
  let uploaded = null;
  try {
    if (!mongoose.isValidObjectId(req.params.playerId)) {
      return res.status(400).json({ success: false, message: "Invalid player ID" });
    }
    const player = await Player.findById(req.params.playerId).select("+imagePublicId");
    if (!player) return res.status(404).json({ success: false, message: "Player not found" });
    const previousImagePublicId = player.imagePublicId;

    if (player.status === "sold") {
      return res.status(409).json({ success: false, message: "Sold players cannot be edited from player management" });
    }

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (name.length < 2 || name.length > 100) return res.status(400).json({ success: false, message: "Player name must be between 2 and 100 characters" });
      player.name = name;
    }
    if (req.body.role !== undefined) {
      if (!PLAYER_ROLES.includes(req.body.role)) return res.status(400).json({ success: false, message: "Select a valid player role" });
      player.role = req.body.role;
    }
    if (req.body.nationality !== undefined) {
      const nationality = String(req.body.nationality).trim();
      if (nationality.length > 60) return res.status(400).json({ success: false, message: "Nationality must not exceed 60 characters" });
      player.nationality = nationality;
    }
    if (req.body.age !== undefined) {
      const age = parseOptionalAge(req.body.age);
      if (Number.isNaN(age)) return res.status(400).json({ success: false, message: "Age must be between 15 and 60" });
      player.age = age;
    }
    if (req.body.basePrice !== undefined) {
      const basePrice = Number(req.body.basePrice);
      if (!Number.isSafeInteger(basePrice) || basePrice < 0) return res.status(400).json({ success: false, message: "Base price must be a non-negative whole number" });
      player.basePrice = basePrice;
    }
    if (req.body.auctionId !== undefined && normalizeAuctionId(req.body.auctionId) !== player.auctionId) {
      return res.status(400).json({ success: false, message: "A player's auction cannot be changed after creation" });
    }
    if (req.body.teamId !== undefined) {
      if (!req.body.teamId) {
        player.teamId = null;
      } else {
        if (!mongoose.isValidObjectId(req.body.teamId)) return res.status(400).json({ success: false, message: "Invalid team selection" });
        const team = await Team.findOne({ _id: req.body.teamId, auctionId: player.auctionId });
        if (!team) return res.status(400).json({ success: false, message: "Selected team does not belong to this auction" });
        player.teamId = team._id;
      }
    }

    if (req.file) {
      if (!validImageSignature(req.file)) return res.status(400).json({ success: false, message: "Uploaded file is not a valid JPEG, PNG, or WebP image" });
      uploaded = await uploadImage(req.file.buffer, "player-photos");
      player.imageUrl = uploaded.secure_url;
      player.imagePublicId = uploaded.public_id;
    }

    await player.save();
    if (uploaded && previousImagePublicId && previousImagePublicId !== uploaded.public_id) {
      await deleteImage(previousImagePublicId).catch(() => {});
    }

    const result = await Player.findById(player._id)
      .select("-imagePublicId")
      .populate("teamId", "name shortName logoUrl")
      .lean();

    res.json({ success: true, message: "Player updated successfully", player: result });
  } catch (error) {
    if (uploaded?.public_id) await deleteImage(uploaded.public_id).catch(() => {});
    next(error);
  }
};

exports.deletePlayer = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.playerId)) {
      return res.status(400).json({ success: false, message: "Invalid player ID" });
    }
    const player = await Player.findById(req.params.playerId).select("+imagePublicId");
    if (!player) return res.status(404).json({ success: false, message: "Player not found" });
    if (player.status === "sold") {
      return res.status(409).json({ success: false, message: "Sold players cannot be deleted" });
    }

    await player.deleteOne();
    if (player.imagePublicId) {
      await deleteImage(player.imagePublicId).catch((error) => {
        console.error("Cloudinary player image cleanup failed:", error.message);
      });
    }
    res.json({ success: true, message: "Player deleted successfully" });
  } catch (error) {
    next(error);
  }
};
