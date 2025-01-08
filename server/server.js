const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

require("dotenv").config();
const { User } = require("../auth/auth"); // Import the User model

const mongoose = require("mongoose");
const { router: authRouter, verifyToken } = require("../auth/auth");

// Add body parser middleware
app.use(express.json());

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch((err) => console.error("Could not connect to MongoDB Atlas", err));

// Use auth routes
app.use("/auth", authRouter);

const rooms = new Map();

function getRoomParticipants(roomId) {
  if (!rooms.has(roomId)) {
    return { count: 0, participants: [] };
  }

  const roomParticipants = Array.from(rooms.get(roomId).values());
  return {
    count: roomParticipants.length,
    participants: roomParticipants,
  };
}

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }, // Expiration time for the room
  roomType: { type: String },
  roomThumbnail: { type: String },
  roomTheme: { type: String },
});

roomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Room = mongoose.model("Room", roomSchema);

// Create a new room
app.post("/rooms", verifyToken, async (req, res) => {
  try {
    console.log("Creating new room:", req.body);
    const { name, roomType, roomThumbnail, roomTheme } = req.body;
    const expirationDuration = 24 * 60 * 60 * 1000; // Room lifespan: 24 hours
    const expiresAt = new Date(Date.now() + expirationDuration);

    const newRoom = new Room({
      name,
      roomType,
      roomThumbnail,
      roomTheme,
      expiresAt,
    });
    await newRoom.save();
    res.status(201).json(newRoom);
  } catch (error) {
    res.status(500).json({ message: "Error creating room", error });
  }
});

app.get("/rooms", async (req, res) => {
  try {
    const dbRooms = await Room.find().sort({ createdAt: -1 });
    const roomsWithUserCount = dbRooms.map((room) => {
      const userCount = rooms.get(room._id.toString())?.size || 0;
      return {
        _id: room._id,
        name: room.name,
        roomType: room.roomType,
        roomThumbnail: room.roomThumbnail,
        roomTheme: room.roomTheme,
        expiresAt: room.expiresAt,
        userCount: userCount,
      };
    });
    res.json(roomsWithUserCount);
  } catch (error) {
    res.status(500).json({ message: "Error fetching rooms", error });
  }
});

async function handleDisconnect(socket, roomId, userId) {
  console.log(`User ${userId} disconnected from room ${roomId}`);

  if (rooms.has(roomId)) {
    rooms.get(roomId).delete(userId);

    try {
      const room = await Room.findById(roomId);
      if (room && room.host === userId) {
        // Host disconnected - handle room closure
        await Room.findByIdAndDelete(roomId);
        rooms.delete(roomId);
        io.to(roomId).emit("room-closed", "Host has left the room");
      } else {
        // Regular user disconnected
        socket.to(roomId).emit("user-left", userId);

        // Send updated participants info
        const participantsInfo = getRoomParticipants(roomId);
        io.to(roomId).emit("participants-update", participantsInfo);
      }
    } catch (error) {
      console.error("Error handling disconnect:", error);
    }
  }
}

io.on("connection", (socket) => {
  let currentRoom = null;
  let currentUserId = null;

  socket.on("unmute-user", (roomId, userId) => {
    io.to(userId).emit("unmute-user");
    io.to(roomId).emit("user-unmuted", userId); // Add this line
  });

  socket.on("report-user", async ({ reportedUserId, reporterId }, callback) => {
    // Add debug logs
    console.log("Received report request:", { reportedUserId, reporterId });

    try {
      // Validate input and log the validation check
      if (!reportedUserId || !reporterId) {
        console.log("Invalid IDs:", { reportedUserId, reporterId });
        return callback({
          success: false,
          message: "Invalid user IDs provided",
        });
      }

      console.log("Looking up users with IDs:", { reportedUserId, reporterId });

      const [reportedUser, reporter] = await Promise.all([
        User.findById(reportedUserId),
        User.findById(reporterId),
      ]);

      console.log("Found users:", {
        reportedUser: reportedUser ? "exists" : "not found",
        reporter: reporter ? "exists" : "not found",
      });

      if (!reportedUser) {
        return callback({
          success: false,
          message: "Reported user not found",
        });
      }

      if (!reporter) {
        return callback({
          success: false,
          message: "Reporter not found",
        });
      }

      // Decrease reputation
      reportedUser.reputationLevel = Math.max(
        0,
        (reportedUser.reputationLevel || 70) - 5
      );
      await reportedUser.save();

      console.log("Updated reputation level:", reportedUser.reputationLevel);

      callback({
        success: true,
        message: "User reported successfully",
        newReputationLevel: reportedUser.reputationLevel,
      });
    } catch (error) {
      console.error("Error handling user report:", error);
      callback({
        success: false,
        message: "An error occurred while processing the report",
      });
    }
  });

  socket.on("mute-all", (roomId) => {
    // Notify all users in the room to mute their audio
    io.to(roomId).emit("mute-all");
  });

  socket.on("mute-user", (roomId, userId) => {
    io.to(userId).emit("mute-user");
    io.to(roomId).emit("user-muted", userId); // Add this line
  });

  socket.on("kick-user", (roomId, userId) => {
    console.log("Kicking user:", userId, "from room:", roomId);

    // Get all socket IDs for the user in this room
    const room = rooms.get(roomId);
    if (room) {
      // Get user info to identify all their connections
      const userInfo = Array.from(room.values()).find(
        (user) => user.userId === userId || user.socketId === userId
      );

      if (userInfo) {
        // Find all sockets belonging to this user
        const userSockets = Array.from(room.entries())
          .filter(([socketId, user]) => user.fullName === userInfo.fullName)
          .map(([socketId]) => socketId);

        // Kick all connections for this user
        userSockets.forEach((socketId) => {
          io.to(socketId).emit("kicked");
          room.delete(socketId);
          const kickedSocket = io.sockets.sockets.get(socketId);
          if (kickedSocket) {
            kickedSocket.leave(roomId);
          }
        });

        // Notify others and update participant list
        socket.to(roomId).emit("user-kicked", userId);
        const participantsInfo = getRoomParticipants(roomId);
        io.to(roomId).emit("participants-update", participantsInfo);
      }
    }
  });

  socket.on("join-room", async (roomId, userId, userData = {}) => {
    try {
      currentRoom = roomId;
      currentUserId = userId;

      // Initialize room if it doesn't exist
      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Map());
      }

      // Add user to room with complete user data
      rooms.get(roomId).set(userId, {
        userId: userData._id, // MongoDB _id
        username: userData.username, // Username for display
        fullName: userData.fullName || "Anonymous User",
        profilePic: userData.profilePic || null,
        isAnonymous: !userData.fullName,
      });

      // Join the socket room
      socket.join(roomId);

      // Get updated participants info
      const participantsInfo = getRoomParticipants(roomId);

      // Broadcast to everyone in the room, including the sender
      io.to(roomId).emit("participants-update", participantsInfo);

      // Notify others about the new user
      socket.to(roomId).emit("user-joined", userId);

      // Set up periodic sync for this room
      const syncInterval = setInterval(() => {
        if (rooms.has(roomId)) {
          const updatedParticipants = getRoomParticipants(roomId);
          io.to(roomId).emit("participants-update", updatedParticipants);
        }
      }, 5000);

      // Handle messages
      socket.on("send-message", (message) => {
        // Broadcast to all clients in the room except the sender
        socket.to(roomId).emit("receive-message", {
          userId: message.userId,
          message: message.message,
          timestamp: Date.now(),
          senderName: message.senderName, // Include sender name
          profilePic: message.profilePic, // Include profile picture
        });
      });

      // Handle WebRTC signaling
      socket.on("offer", (data) => {
        console.log(`Relaying offer from ${userId} to ${data.targetId}`);
        socket.to(data.targetId).emit("offer", {
          userId: userId,
          description: data.description,
        });
      });

      socket.on("answer", (data) => {
        console.log(`Relaying answer from ${userId} to ${data.targetId}`);
        socket.to(data.targetId).emit("answer", {
          userId: userId,
          description: data.description,
        });
      });

      socket.on("ice-candidate", (data) => {
        console.log(
          `Relaying ICE candidate from ${userId} to ${data.targetId}`
        );
        socket.to(data.targetId).emit("ice-candidate", {
          userId: userId,
          candidate: data.candidate,
        });
      });

      socket.on("host-leave", async (roomId) => {
        console.log(`Host is leaving room ${roomId}`);
        try {
          // Remove the room from the database
          await Room.findByIdAndDelete(roomId);

          // Remove the room from the in-memory Map
          rooms.delete(roomId);

          // Notify all users in the room that it's being closed
          io.to(roomId).emit("room-closed", "Host has left the room");

          // Disconnect all sockets in the room
          const socketsInRoom = await io.in(roomId).fetchSockets();
          socketsInRoom.forEach((socket) => {
            socket.leave(roomId);
            socket.disconnect(true);
          });
        } catch (error) {
          console.error("Error closing room:", error);
        }
      });

      socket.on("leave-room", (roomId) => {
        console.log(`User ${currentUserId} is leaving room ${roomId}`);
        if (rooms.has(roomId)) {
          // Change from socket.id to currentUserId
          rooms.get(roomId).delete(currentUserId);
          socket.to(roomId).emit("user-left", currentUserId);

          const participantsInfo = getRoomParticipants(roomId);
          io.to(roomId).emit("participants-update", participantsInfo);
        }
        socket.leave(roomId);
      });

      // Handle disconnection
      socket.on("disconnect", () => {
        clearInterval(syncInterval);
        if (currentRoom && currentUserId) {
          handleDisconnect(socket, currentRoom, currentUserId);
        }
      });
    } catch (err) {
      console.error("Error in join-room:", err);
    }

    socket.on("request-participant-count", (roomId) => {
      if (rooms.has(roomId)) {
        const participantsInfo = getRoomParticipants(roomId);
        io.to(roomId).emit("participants-update", participantsInfo);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});
