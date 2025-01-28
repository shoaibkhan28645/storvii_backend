// config/socket.js
const socketIO = require("socket.io");

const configureSocket = (server) => {
  const io = socketIO(server, {
    cors: {
      origin: "*", // Configure according to your needs
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("A user connected");

    socket.on("disconnect", () => {
      console.log("User disconnected");
    });

    // Add other socket event handlers here
    socket.on("join_room", (roomId) => {
      socket.join(roomId);
      console.log(`User joined room: ${roomId}`);
    });

    // ... other event handlers
  });

  return io;
};

module.exports = configureSocket;
