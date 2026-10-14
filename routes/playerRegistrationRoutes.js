const express = require("express");
const crypto = require("crypto");
const Auction = require("../models/Auction");
const Player = require("../models/Player");
const PlayerRegistrationLink = require("../models/PlayerRegistrationLink");
const { protectRoute } = require("../middleware/authMiddleware");
const imageUpload = require("../middleware/imageUpload");
const { uploadImage, deleteImage } = require("../config/cloudinary");

const router = express.Router();
const normalizeId = (v) => String(v || "").trim().toUpperCase();
function validImageSignature(file) {
  if (!file?.buffer) return false;
  const b = file.buffer;
  if (file.mimetype === "image/jpeg") return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (file.mimetype === "image/png") return b.length > 8 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (file.mimetype === "image/webp") return b.length > 12 && b.toString("ascii",0,4) === "RIFF" && b.toString("ascii",8,12) === "WEBP";
  return false;
}

// Generate a link for an auction the authenticated account is permitted to manage.
router.post("/links", protectRoute, async (req, res, next) => {
  try {
    const auctionId = req.user.role === "admin" ? normalizeId(req.body.auctionId) : normalizeId(req.authAuctionId);
    if (!auctionId) return res.status(400).json({ success:false, message:"Select an auction first." });
    if (req.user.role !== "admin" && !(req.user.assignedAuctionIds || []).some(id => normalizeId(id) === auctionId)) {
      return res.status(403).json({ success:false, message:"You cannot create a registration link for this auction." });
    }
    const auction = await Auction.findOne({ auctionId });
    if (!auction) return res.status(404).json({ success:false, message:"Auction not found." });
    if (["completed", "archived"].includes(auction.status)) return res.status(409).json({ success:false, message:"Registration is closed for this auction." });
    let link = await PlayerRegistrationLink.findOne({ auctionId, active:true });
    if (!link) link = await PlayerRegistrationLink.create({ token: crypto.randomBytes(24).toString("hex"), auctionId, createdBy:req.user._id });
    const origin = process.env.CLIENT_URL || "http://localhost:5173";
    return res.status(200).json({ success:true, auction:{ name:auction.name, auctionId }, url:`${origin.replace(/\/$/, "")}/register-player/${link.token}` });
  } catch (error) { next(error); }
});

// Public, read-only metadata for the token-bound auction.
router.get("/:token", async (req, res, next) => {
  try {
    const link = await PlayerRegistrationLink.findOne({ token:req.params.token, active:true }).lean();
    if (!link || (link.expiresAt && link.expiresAt < new Date())) return res.status(404).json({ success:false, message:"This registration link is invalid or expired." });
    const auction = await Auction.findOne({ auctionId:link.auctionId }).select("name auctionId status minimumBid").lean();
    if (!auction || ["completed", "archived"].includes(auction.status)) return res.status(410).json({ success:false, message:"Registration is closed for this auction." });
    return res.json({ success:true, auction:{ name:auction.name, auctionId:auction.auctionId } });
  } catch (error) { next(error); }
});

// Public form submission: auctionId is derived only from the opaque token, never from client input.
router.post("/:token", imageUpload.single("photo"), async (req, res, next) => {
  let uploaded = null;
  try {
    const link = await PlayerRegistrationLink.findOne({ token:req.params.token, active:true });
    if (!link || (link.expiresAt && link.expiresAt < new Date())) return res.status(404).json({ success:false, message:"This registration link is invalid or expired." });
    const auction = await Auction.findOne({ auctionId:link.auctionId });
    if (!auction || ["completed", "archived"].includes(auction.status)) return res.status(410).json({ success:false, message:"Registration is closed for this auction." });
    const firstName = String(req.body.firstName || "").trim();
    const lastName = String(req.body.lastName || "").trim();
    const name = `${firstName} ${lastName}`.trim();
    const birthdateRaw = String(req.body.birthdate || "").trim();
    const contactNo = String(req.body.contactNo || "").trim();
    const whatsappNo = String(req.body.whatsappNo || "").trim();
    const villageTown = String(req.body.villageTown || "").trim();
    if (firstName.length < 1 || firstName.length > 50 || !/^[\p{L}][\p{L} .'-]*$/u.test(firstName)) return res.status(400).json({ success:false, message:"Enter a valid first name (1–50 characters)." });
    if (lastName.length < 1 || lastName.length > 50 || !/^[\p{L}][\p{L} .'-]*$/u.test(lastName)) return res.status(400).json({ success:false, message:"Enter a valid last name (1–50 characters)." });
    if (name.length > 100) return res.status(400).json({ success:false, message:"Combined player name must not exceed 100 characters." });
    const birthdate = new Date(`${birthdateRaw}T00:00:00.000Z`);
    if (!birthdateRaw || Number.isNaN(birthdate.getTime()) || birthdate >= new Date() || birthdate < new Date("1900-01-01T00:00:00.000Z")) return res.status(400).json({ success:false, message:"Enter a valid birthdate." });
    const age = Math.floor((Date.now() - birthdate.getTime()) / 31557600000);
    if (age < 15 || age > 60) return res.status(400).json({ success:false, message:"Players must be between 15 and 60 years old." });
    const phonePattern = /^[+\d()\-\s]{7,20}$/;
    if (!phonePattern.test(contactNo)) return res.status(400).json({ success:false, message:"Enter a valid contact number." });
    if (whatsappNo && !phonePattern.test(whatsappNo)) return res.status(400).json({ success:false, message:"Enter a valid WhatsApp number." });
    if (villageTown.length < 2 || villageTown.length > 100) return res.status(400).json({ success:false, message:"Village/Town must be between 2 and 100 characters." });
    if (req.file) {
      if (!validImageSignature(req.file)) return res.status(400).json({ success:false, message:"Photo must be a valid JPEG, PNG, or WebP image." });
      uploaded = await uploadImage(req.file.buffer, "player-photos");
    }
    const player = await Player.create({
      name, firstName, lastName, birthdate, age, contactNo, whatsappNo, villageTown,
      role:"All-Rounder", nationality:"India", basePrice:auction.minimumBid,
      auctionId:auction.auctionId, createdBy:link.createdBy, imageUrl:uploaded?.secure_url || "",
      imagePublicId:uploaded?.public_id || "", status:"available", registrationSource:"public-form"
    });
    return res.status(201).json({ success:true, message:`Thanks ${firstName}! Your registration for ${auction.name} was submitted successfully.`, playerId:player._id });
  } catch (error) {
    if (uploaded?.public_id) await deleteImage(uploaded.public_id).catch(() => {});
    next(error);
  }
});
module.exports = router;
