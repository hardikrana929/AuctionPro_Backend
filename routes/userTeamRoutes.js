const express = require("express");
const Team = require("../models/Team");
const { protectRoute } = require("../middleware/authMiddleware");
const imageUpload = require("../middleware/imageUpload");
const controller = require("../controllers/teamController");
const router = express.Router();
router.use(protectRoute, (req,res,next) => req.user?.role === "user" ? next() : res.status(403).json({success:false,message:"User account access required"}));
function scope(req,res,next) { req.authAuctionId = String(req.authAuctionId || "").trim().toUpperCase(); if (!req.authAuctionId) return res.status(403).json({success:false,message:"No auction selected"}); req.query.auctionId=req.authAuctionId; if(req.body) req.body.auctionId=req.authAuctionId; next(); }
router.get("/", scope, controller.getTeams);
router.get("/:teamId", async (req,res,next) => { try { const team=await Team.findById(req.params.teamId).select("auctionId").lean(); if(!team || team.auctionId !== req.authAuctionId) return res.status(404).json({success:false,message:"Team not found in your assigned auction"}); next(); } catch(e){next(e)} }, controller.getTeamById);
router.post("/", imageUpload.single("logo"), scope, controller.createTeam);
router.put("/:teamId", imageUpload.single("logo"), scope, async (req,res,next) => { try { const team=await Team.findById(req.params.teamId).select("auctionId").lean(); if(!team || team.auctionId !== req.authAuctionId) return res.status(404).json({success:false,message:"Team not found in your assigned auction"}); next(); } catch(e){next(e)} }, controller.updateTeam);
router.delete("/:teamId", scope, async (req,res,next) => { try { const team=await Team.findById(req.params.teamId).select("auctionId").lean(); if(!team || team.auctionId !== req.authAuctionId) return res.status(404).json({success:false,message:"Team not found in your assigned auction"}); next(); } catch(e){next(e)} }, controller.deleteTeam);
module.exports=router;
