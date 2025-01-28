const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  username: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String },
  storytellerType: {
    type: String,
    enum: [
      "Storyteller",
      "Listener",
      "Community Builder",
      "Explorer",
      "Cultural Preserver",
    ],
    required: true,
  },
  reputationLevel: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
  },
  googleId: { type: String, unique: true, sparse: true },
  emailVerified: { type: Boolean, default: false },
  profilePicture: { type: String },
});

module.exports = mongoose.model("User", userSchema);
