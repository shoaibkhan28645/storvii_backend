const RoomService = require("../services/roomService");
const Room = require("../models/Room");

class RoomController {
  static async createRoom(req, res) {
    try {
      const { name, roomType, roomThumbnail, roomTheme } = req.body;
      const room = await RoomService.createRoom({
        name,
        roomType,
        roomThumbnail,
        roomTheme,
      });
      res.status(201).json(room);
    } catch (error) {
      res.status(500).json({
        message: "Error creating room",
        error: error.message,
      });
    }
  }

  static async getRooms(req, res) {
    try {
      const dbRooms = await Room.find().sort({ createdAt: -1 });
      const roomsWithUserCount = dbRooms.map((room) => {
        const userCount = RoomService.rooms.get(room._id.toString())?.size || 0;
        return {
          _id: room._id,
          name: room.name,
          roomType: room.roomType,
          roomThumbnail: room.roomThumbnail,
          roomTheme: room.roomTheme,
          expiresAt: room.expiresAt,
          userCount,
        };
      });
      res.json(roomsWithUserCount);
    } catch (error) {
      res.status(500).json({
        message: "Error fetching rooms",
        error: error.message,
      });
    }
  }

  static async deleteRoom(req, res) {
    try {
      const { roomId } = req.params;
      await Room.findByIdAndDelete(roomId);
      RoomService.rooms.delete(roomId);
      res.json({ message: "Room deleted successfully" });
    } catch (error) {
      res.status(500).json({
        message: "Error deleting room",
        error: error.message,
      });
    }
  }
}

module.exports = RoomController;
