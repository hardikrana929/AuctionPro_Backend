const express = require("express");
const {
  getPlayers,
  getPlayerById,
  createPlayer,
  updatePlayer,
  deletePlayer,
} = require("../controllers/playerController");
const imageUpload = require("../middleware/imageUpload");
const { protectRoute, adminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protectRoute, adminOnly);

router.get("/", getPlayers);
router.get("/:playerId", getPlayerById);
router.post("/", imageUpload.single("image"), createPlayer);
router.put("/:playerId", imageUpload.single("image"), updatePlayer);
router.delete("/:playerId", deletePlayer);

module.exports = router;
