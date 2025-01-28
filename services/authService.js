const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const verificationCodes = new Map();

class AuthService {
  static async register(userData) {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const user = new User({
      ...userData,
      password: hashedPassword,
    });
    return await user.save();
  }

  static async login(credentials) {
    const user = await User.findOne({
      $or: [{ username: credentials.login }, { email: credentials.login }],
    });

    if (!user) throw new Error("User not found");

    const validPassword = await bcrypt.compare(
      credentials.password,
      user.password
    );
    if (!validPassword) throw new Error("Invalid password");

    return jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
  }

  static async verifyGoogleToken(idToken) {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    return ticket.getPayload();
  }
}

module.exports = AuthService;
