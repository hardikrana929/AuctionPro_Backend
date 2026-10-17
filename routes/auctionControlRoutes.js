const express = require("express");
const { protectRoute } = require("../middleware/authMiddleware");
const controller = require("../controllers/auctionControlController");

const router = express.Router();
router.use(protectRoute);
router.get("/:auctionId/state", controller.getState);
router.get("/:auctionId/history", controller.getHistory);
router.post("/:auctionId/start", controller.startAuction);
router.post("/:auctionId/pause", controller.pauseAuction);
router.post("/:auctionId/next-player", controller.selectNextPlayer);
router.post("/:auctionId/bids", controller.placeBid);
router.post("/:auctionId/sold", controller.markSold);
router.post("/:auctionId/unsold", controller.markUnsold);
module.exports = router;
