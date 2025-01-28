const Room = require("../models/Room");

class RoomService {
  static rooms = new Map();

  static async createRoom(roomData) {
    const expirationDuration = 1 * 60 * 60 * 1000;
    const room = new Room({
      ...roomData,
      expiresAt: new Date(Date.now() + expirationDuration),
    });
    return await room.save();
  }

  static getRoomParticipants(roomId) {
    if (!this.rooms.has(roomId)) {
      return { count: 0, participants: [] };
    }
    const roomParticipants = Array.from(this.rooms.get(roomId).values());
    return {
      count: roomParticipants.length,
      participants: roomParticipants,
    };
  }
}

module.exports = RoomService;
