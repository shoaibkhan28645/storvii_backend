const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const token = req.header("Authorization");

  if (!token) {
    return res.status(401).json({ error: "Access denied" });
  }

  try {
    const tokenWithoutBearer = token.startsWith("Bearer ")
      ? token.slice(7)
      : token;
    const verified = jwt.verify(tokenWithoutBearer, process.env.JWT_SECRET);
    req.userId = verified.userId;
    next();
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(400).json({ error: "Invalid token", details: error.message });
  }
};

const isHost = (req, res, next) => {
  const room = RoomService.rooms.get(req.params.roomId);
  if (!room || room.host !== req.userId) {
    return res.status(403).json({ error: "Only host can perform this action" });
  }
  next();
};

module.exports = { verifyToken, isHost };
