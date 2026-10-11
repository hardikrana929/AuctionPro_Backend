const mongoose = require("mongoose");
const Team = require("../models/Team");
const Auction = require("../models/Auction");
const Player = require("../models/Player");
const { uploadImage, deleteImage } = require("../config/cloudinary");

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

exports.getTeams = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.auctionId) filter.auctionId = normalizeAuctionId(req.query.auctionId);
    const teams = await Team.find(filter)
      .select("-logoPublicId")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, count: teams.length, teams });
  } catch (error) {
    next(error);
  }
};

exports.getTeamById = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.teamId)) {
      return res.status(400).json({ success: false, message: "Invalid team ID" });
    }
    const team = await Team.findById(req.params.teamId).select("-logoPublicId").lean();
    if (!team) return res.status(404).json({ success: false, message: "Team not found" });
    res.json({ success: true, team });
  } catch (error) {
    next(error);
  }
};

exports.createTeam = async (req, res, next) => {
  let uploaded = null;
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const shortName = typeof req.body.shortName === "string" ? req.body.shortName.trim().toUpperCase() : "";
    const auctionId = normalizeAuctionId(req.body.auctionId);

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ success: false, message: "Team name must be between 2 and 80 characters" });
    }
    if (shortName.length < 2 || shortName.length > 10 || !/^[A-Z0-9]+$/.test(shortName)) {
      return res.status(400).json({ success: false, message: "Team short name must be 2–10 letters or numbers" });
    }
    if (!auctionId) return res.status(400).json({ success: false, message: "Auction ID is required" });

    const auction = await Auction.findOne({ auctionId });
    if (!auction) return res.status(404).json({ success: false, message: "Auction not found" });

    const teamCount = await Team.countDocuments({ auctionId });
    if (teamCount >= auction.maxTeams) {
      return res.status(409).json({ success: false, message: `This auction has reached its limit of ${auction.maxTeams} teams` });
    }

    if (req.file) {
      if (!validImageSignature(req.file)) {
        return res.status(400).json({ success: false, message: "Uploaded file is not a valid JPEG, PNG, or WebP image" });
      }
      uploaded = await uploadImage(req.file.buffer, "team-logos");
    }

    const team = await Team.create({
      name,
      shortName,
      auctionId,
      logoUrl: uploaded?.secure_url || "",
      logoPublicId: uploaded?.public_id || "",
      createdBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: "Team created successfully",
      team: {
        _id: team._id,
        name: team.name,
        shortName: team.shortName,
        auctionId: team.auctionId,
        logoUrl: team.logoUrl,
        createdBy: team.createdBy,
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
      },
    });
  } catch (error) {
    if (uploaded?.public_id) await deleteImage(uploaded.public_id).catch(() => {});
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "A team with this name or short name already exists in this auction" });
    }
    next(error);
  }
};

exports.updateTeam = async (req, res, next) => {
  let uploaded = null;
  try {
    if (!mongoose.isValidObjectId(req.params.teamId)) {
      return res.status(400).json({ success: false, message: "Invalid team ID" });
    }

    const team = await Team.findById(req.params.teamId).select("+logoPublicId");
    if (!team) return res.status(404).json({ success: false, message: "Team not found" });
    const previousLogoPublicId = team.logoPublicId;

    const name = req.body.name === undefined ? team.name : String(req.body.name).trim();
    const shortName = req.body.shortName === undefined ? team.shortName : String(req.body.shortName).trim().toUpperCase();

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ success: false, message: "Team name must be between 2 and 80 characters" });
    }
    if (shortName.length < 2 || shortName.length > 10 || !/^[A-Z0-9]+$/.test(shortName)) {
      return res.status(400).json({ success: false, message: "Team short name must be 2–10 letters or numbers" });
    }

    team.name = name;
    team.shortName = shortName;

    if (req.body.auctionId !== undefined) {
      const auctionId = normalizeAuctionId(req.body.auctionId);
      if (auctionId !== team.auctionId) {
        return res.status(400).json({ success: false, message: "A team's auction cannot be changed after creation" });
      }
    }

    if (req.file) {
      if (!validImageSignature(req.file)) {
        return res.status(400).json({ success: false, message: "Uploaded file is not a valid JPEG, PNG, or WebP image" });
      }
      uploaded = await uploadImage(req.file.buffer, "team-logos");
      team.logoUrl = uploaded.secure_url;
      team.logoPublicId = uploaded.public_id;
    }

    await team.save();

    if (uploaded && previousLogoPublicId && previousLogoPublicId !== uploaded.public_id) {
      await deleteImage(previousLogoPublicId).catch(() => {});
    }

    res.json({
      success: true,
      message: "Team updated successfully",
      team: {
        _id: team._id,
        name: team.name,
        shortName: team.shortName,
        auctionId: team.auctionId,
        logoUrl: team.logoUrl,
        createdBy: team.createdBy,
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
      },
    });
  } catch (error) {
    if (uploaded?.public_id) await deleteImage(uploaded.public_id).catch(() => {});
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "A team with this name or short name already exists in this auction" });
    }
    next(error);
  }
};

exports.deleteTeam = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.teamId)) {
      return res.status(400).json({ success: false, message: "Invalid team ID" });
    }
    const team = await Team.findById(req.params.teamId).select("+logoPublicId");
    if (!team) return res.status(404).json({ success: false, message: "Team not found" });

    const linkedPlayers = await Player.countDocuments({ teamId: team._id });
    if (linkedPlayers > 0) {
      return res.status(409).json({
        success: false,
        message: "This team has players assigned. Remove or reassign those players before deleting the team.",
      });
    }

    await team.deleteOne();
    if (team.logoPublicId) {
      await deleteImage(team.logoPublicId).catch((error) => {
        console.error("Cloudinary team logo cleanup failed:", error.message);
      });
    }

    res.json({ success: true, message: "Team deleted successfully" });
  } catch (error) {
    next(error);
  }
};
