const mongoose = require("mongoose");
const Feedback = require("../models/Feedback");
const Notification = require("../models/Notification");
const Auction = require("../models/Auction");

exports.submitFeedback = async (req, res, next) => {
  try {
    const { category = "Other", rating = 5, message } = req.body;
    const allowed = ["Bug report", "Suggestion", "Auction experience", "Other"];
    if (!allowed.includes(category)) return res.status(400).json({ success: false, message: "Choose a valid feedback category." });
    if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) return res.status(400).json({ success: false, message: "Rating must be from 1 to 5." });
    if (typeof message !== "string" || message.trim().length < 5 || message.trim().length > 2000) return res.status(400).json({ success: false, message: "Feedback must be between 5 and 2,000 characters." });
    const auctionId = req.user.role === "user" ? req.authAuctionId : String(req.body.auctionId || "").trim().toUpperCase() || null;
    if (auctionId && req.user.role === "admin" && !(await Auction.exists({ auctionId }))) return res.status(404).json({ success: false, message: "Auction not found." });
    const feedback = await Feedback.create({ userId: req.user._id, auctionId, category, rating: Number(rating), message: message.trim() });
    const notification = await Notification.create({ type: "feedback", title: "New feedback received", message: `${req.user.username} submitted feedback (${category}).` });
    const io = req.app.get("io");
    if (io) io.to("admins").emit("notification:new", notification.toObject());
    return res.status(201).json({ success: true, message: "Thank you for your feedback.", feedback });
  } catch (error) { next(error); }
};

exports.getMyFeedback = async (req, res, next) => {
  try {
    const feedback = await Feedback.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, feedback });
  } catch (error) { next(error); }
};

exports.getAllFeedback = async (req, res, next) => {
  try {
    const feedback = await Feedback.find().populate("userId", "username role").sort({ createdAt: -1 }).lean();
    return res.json({ success: true, feedback });
  } catch (error) { next(error); }
};

exports.updateFeedback = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.feedbackId)) return res.status(400).json({ success: false, message: "Invalid feedback ID." });
    const { status, adminResponse = "" } = req.body;
    if (!(["New", "In Review", "Resolved"].includes(status))) return res.status(400).json({ success: false, message: "Choose a valid feedback status." });
    if (typeof adminResponse !== "string" || adminResponse.length > 2000) return res.status(400).json({ success: false, message: "Response must be 2,000 characters or fewer." });
    const feedback = await Feedback.findByIdAndUpdate(req.params.feedbackId, { status, adminResponse: adminResponse.trim() }, { new: true, runValidators: true }).populate("userId", "username");
    if (!feedback) return res.status(404).json({ success: false, message: "Feedback not found." });
    const notification = await Notification.create({ recipientId: feedback.userId._id, auctionId: feedback.auctionId, type: "feedback", title: "Feedback updated", message: `Your feedback status is now ${status}.${adminResponse.trim() ? ` Admin response: ${adminResponse.trim()}` : ""}` });
    const io = req.app.get("io");
    if (io) io.to(`user:${feedback.userId._id}`).emit("notification:new", notification.toObject());
    return res.json({ success: true, message: "Feedback updated.", feedback });
  } catch (error) { next(error); }
};
