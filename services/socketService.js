const RoomService = require("./roomService");
const User = require("../models/User");

class SocketService {
  constructor(io) {
    this.io = io;
    this.kickedUsersMap = new Map();
  }

  handleSocketConnection(socket) {
    let currentRoom = null;
    let currentUserId = null;

    socket.on("join-room", async (roomId, userId, userData = {}) => {
      try {
        const userMongoId = userData.id;

        // Check if user is banned
        if (this.isUserBanned(roomId, userMongoId)) {
          socket.emit("kicked");
          return;
        }

        currentRoom = roomId;
        currentUserId = userData.id;

        await this.addUserToRoom(socket, roomId, userData);
        this.setupRoomEventListeners(socket, roomId, userId);
        this.setupMessageHandlers(socket, roomId);
        this.setupWebRTCHandlers(socket, userId);
      } catch (err) {
        console.error("Error in join-room:", err);
        socket.emit("error", "Failed to join room");
      }
    });

    socket.on("disconnect", () => {
      if (currentRoom && currentUserId) {
        this.handleDisconnect(socket, currentRoom, currentUserId);
      }
    });
  }

  async addUserToRoom(socket, roomId, userData) {
    if (!RoomService.rooms.has(roomId)) {
      RoomService.rooms.set(roomId, new Map());
    }

    RoomService.rooms.get(roomId).set(socket.id, {
      userId: socket.id,
      mongoId: userData.id,
      fullName: userData.fullName || "Anonymous User",
      profilePic: userData.profilePic || null,
      isAnonymous: !userData.fullName,
    });

    socket.join(roomId);

    const participantsInfo = RoomService.getRoomParticipants(roomId);
    this.io.to(roomId).emit("participants-update", participantsInfo);

    socket.to(roomId).emit("user-joined", {
      id: socket.id,
      fullName: userData.fullName || "Anonymous User",
      profilePic: userData.profilePic || null,
    });
  }

  setupRoomEventListeners(socket, roomId, userId) {
    socket.on("mute-user", (targetId) => {
      this.io.to(targetId).emit("mute-user");
      this.io.to(roomId).emit("user-muted", { userId: targetId, forced: true });
    });

    socket.on("unmute-user", (targetId) => {
      this.io.to(targetId).emit("unmute-user");
      this.io
        .to(roomId)
        .emit("user-unmuted", { userId: targetId, forced: true });
    });

    socket.on("kick-user", (socketIdToKick) => {
      this.handleKickUser(roomId, socketIdToKick);
    });

    socket.on("host-leave", async () => {
      await this.handleHostLeave(roomId);
    });
  }

  setupMessageHandlers(socket, roomId) {
    socket.on("send-message", (message) => {
      socket.to(roomId).emit("receive-message", {
        userId: message.userId,
        message: message.message,
        timestamp: Date.now(),
        senderName: message.senderName,
        profilePic: message.profilePic,
      });
    });
  }

  setupWebRTCHandlers(socket, userId) {
    socket.on("offer", (data) => {
      socket.to(data.targetId).emit("offer", {
        userId: userId,
        description: data.description,
      });
    });

    socket.on("answer", (data) => {
      socket.to(data.targetId).emit("answer", {
        userId: userId,
        description: data.description,
      });
    });

    socket.on("ice-candidate", (data) => {
      socket.to(data.targetId).emit("ice-candidate", {
        userId: userId,
        candidate: data.candidate,
      });
    });
  }

  async handleHostLeave(roomId) {
    try {
      const Room = require("../models/Room");
      await Room.findByIdAndDelete(roomId);
      RoomService.rooms.delete(roomId);
      this.io.to(roomId).emit("room-closed", "Host has left the room");

      const socketsInRoom = await this.io.in(roomId).fetchSockets();
      socketsInRoom.forEach((socket) => {
        socket.leave(roomId);
        socket.disconnect(true);
      });
    } catch (error) {
      console.error("Error closing room:", error);
    }
  }

  handleKickUser(roomId, socketIdToKick) {
    const room = RoomService.rooms.get(roomId);
    if (room) {
      const userObj = room.get(socketIdToKick);
      if (userObj) {
        this.io.to(socketIdToKick).emit("kicked");
        room.delete(socketIdToKick);

        const kickedSocket = this.io.sockets.sockets.get(socketIdToKick);
        if (kickedSocket) {
          kickedSocket.leave(roomId);
        }

        if (!this.kickedUsersMap.has(roomId)) {
          this.kickedUsersMap.set(roomId, new Set());
        }
        this.kickedUsersMap.get(roomId).add(userObj.mongoId);

        const participantsInfo = RoomService.getRoomParticipants(roomId);
        this.io.to(roomId).emit("participants-update", participantsInfo);
      }
    }
  }

  handleDisconnect(socket, roomId, userId) {
    if (RoomService.rooms.has(roomId)) {
      RoomService.rooms.get(roomId).delete(userId);
      socket.to(roomId).emit("user-left", userId);

      const participantsInfo = RoomService.getRoomParticipants(roomId);
      this.io.to(roomId).emit("participants-update", participantsInfo);
    }
  }

  isUserBanned(roomId, userMongoId) {
    return (
      this.kickedUsersMap.has(roomId) &&
      this.kickedUsersMap.get(roomId).has(userMongoId)
    );
  }
}

module.exports = SocketService;
