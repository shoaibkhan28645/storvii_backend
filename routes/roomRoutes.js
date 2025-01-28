const express = require("express");
const router = express.Router();
const RoomController = require("../controllers/roomController");
const { verifyToken } = require("../middleware/auth");

router.post("/", verifyToken, RoomController.createRoom);
router.get("/", RoomController.getRooms);
router.delete("/:roomId", verifyToken, RoomController.deleteRoom);

module.exports = router;
