const express = require("express");
const {
  getTeams,
  getTeamById,
  createTeam,
  updateTeam,
  deleteTeam,
} = require("../controllers/teamController");
const imageUpload = require("../middleware/imageUpload");
const { protectRoute, adminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protectRoute, adminOnly);

router.get("/", getTeams);
router.get("/:teamId", getTeamById);
router.post("/", imageUpload.single("logo"), createTeam);
router.put("/:teamId", imageUpload.single("logo"), updateTeam);
router.delete("/:teamId", deleteTeam);

module.exports = router;
