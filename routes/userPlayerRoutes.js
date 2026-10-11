const express = require("express");
const Player = require("../models/Player");
const { protectRoute } = require("../middleware/authMiddleware");
const imageUpload = require("../middleware/imageUpload");
const controller = require("../controllers/playerController");
const router = express.Router();
router.use(protectRoute, (req,res,next) => req.user?.role === "user" ? next() : res.status(403).json({success:false,message:"User account access required"}));
function scope(req,res,next) { req.authAuctionId = String(req.authAuctionId || "").trim().toUpperCase(); if (!req.authAuctionId) return res.status(403).json({success:false,message:"No auction selected"}); req.query.auctionId=req.authAuctionId; if(req.body) req.body.auctionId=req.authAuctionId; next(); }
router.get("/", scope, controller.getPlayers);
router.get("/:playerId", async (req,res,next) => { try { const player=await Player.findById(req.params.playerId).select("auctionId").lean(); if(!player || player.auctionId !== req.authAuctionId) return res.status(404).json({success:false,message:"Player not found in your assigned auction"}); next(); } catch(e){next(e)} }, controller.getPlayerById);
router.post("/", imageUpload.single("image"), scope, controller.createPlayer);
router.put("/:playerId", imageUpload.single("image"), scope, async (req,res,next) => { try { const player=await Player.findById(req.params.playerId).select("auctionId").lean(); if(!player || player.auctionId !== req.authAuctionId) return res.status(404).json({success:false,message:"Player not found in your assigned auction"}); next(); } catch(e){next(e)} }, controller.updatePlayer);
router.delete("/:playerId", scope, async (req,res,next) => { try { const player=await Player.findById(req.params.playerId).select("auctionId").lean(); if(!player || player.auctionId !== req.authAuctionId) return res.status(404).json({success:false,message:"Player not found in your assigned auction"}); next(); } catch(e){next(e)} }, controller.deletePlayer);
module.exports=router;
