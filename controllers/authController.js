const AuthService = require("../services/authService");
const EmailService = require("../services/emailService");
const User = require("../models/User");

const verificationCodes = new Map();

class AuthController {
  static async signup(req, res) {
    try {
      const {
        fullName,
        username,
        email,
        password,
        storytellerType,
        verificationCode,
      } = req.body;

      // Check existing username
      const existingUsername = await User.findOne({ username });
      if (existingUsername) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Check existing email
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Verify code if provided
      if (verificationCode) {
        const storedCode = verificationCodes.get(email);
        if (!storedCode || storedCode !== verificationCode) {
          return res.status(400).json({ error: "Invalid verification code" });
        }

        const user = await AuthService.register({
          fullName,
          username,
          email,
          password,
          storytellerType,
          reputationLevel: 70,
          profilePicture: req.file ? req.file.path : null,
        });

        verificationCodes.delete(email);

        return res.status(201).json({
          message: "User created successfully",
          user: {
            id: user._id,
            fullName: user.fullName,
            username: user.username,
            email: user.email,
            storytellerType: user.storytellerType,
            reputationLevel: user.reputationLevel,
            profilePicture: user.profilePicture,
          },
        });
      } else {
        // Send verification code
        const code = EmailService.generateVerificationCode();
        verificationCodes.set(email, code);
        await EmailService.sendVerificationEmail(email, code);
        return res
          .status(200)
          .json({ message: "Verification code sent to email" });
      }
    } catch (error) {
      res
        .status(500)
        .json({ error: "Error signing up", details: error.message });
    }
  }

  static async login(req, res) {
    try {
      const { login, password } = req.body;
      const token = await AuthService.login({ login, password });
      res.json({ token });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  static async googleSignIn(req, res) {
    try {
      const { idToken } = req.body;
      const payload = await AuthService.verifyGoogleToken(idToken);
      const { name, email, sub: googleId, picture } = payload;

      let user = await User.findOne({ googleId });
      if (!user) {
        user = await AuthService.register({
          fullName: name,
          username: email.split("@")[0],
          email,
          googleId,
          storytellerType: "Listener",
          reputationLevel: 70,
          emailVerified: true,
          profilePicture: picture,
        });
      }

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
      res.json({ token });
    } catch (error) {
      res.status(500).json({
        error: "Error with Google Sign-In",
        details: error.message,
      });
    }
  }

  static async resendVerification(req, res) {
    try {
      const { email } = req.body;
      const code = EmailService.generateVerificationCode();
      verificationCodes.set(email, code);
      await EmailService.sendVerificationEmail(email, code);
      res.status(200).json({ message: "Verification code resent" });
    } catch (error) {
      res.status(500).json({
        error: "Error resending code",
        details: error.message,
      });
    }
  }
}

module.exports = AuthController;
