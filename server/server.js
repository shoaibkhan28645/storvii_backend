// server.js
require("dotenv").config();
const express = require("express");
const http = require("http");
const connectDB = require("../config/database");
const configureSocket = require("../config/socket");
const authRoutes = require("../routes/authRoutes");
const roomRoutes = require("../routes/roomRoutes");
const userRoutes = require("../routes/userRoutes");

const app = express();
const server = http.createServer(app);

// Connect to database
connectDB();

// Configure Socket.IO
const io = configureSocket(server);

// Middleware
app.use(express.json());

// Routes
app.use("/auth", authRoutes);
app.use("/rooms", roomRoutes);
app.use("/users", userRoutes);

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = { app, io };
