const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const nodemailer = require("nodemailer");
const multer = require("multer");
const path = require("path");
const Report = require("../models/Report");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// User model
const User = mongoose.model("User", {
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

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com", // Replace with your SMTP host
  port: 587,
  secure: false, // Use TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendVerificationEmail = async (email, code) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Email Verification for Storvii",
    text: `Your verification code is: ${code}`,
    html: `<p>Your verification code is: <strong>${code}</strong></p>`,
  };

  await transporter.sendMail(mailOptions);
};

const verificationCodes = new Map();

// Sign-up route
// Sign-up route
router.post("/signup", upload.single("profilePicture"), async (req, res) => {
  try {
    const {
      fullName,
      username,
      email,
      password,
      storytellerType,
      verificationCode,
    } = req.body;

    // Check if username already exists
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ error: "Username already exists" });
    }

    // Check if email already exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ error: "Email already exists" });
    }

    // If verificationCode is provided, verify it
    if (verificationCode) {
      const storedCode = verificationCodes.get(email);
      if (!storedCode || storedCode !== verificationCode) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      // Code is valid, proceed with user creation
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User({
        fullName,
        username,
        email,
        password: hashedPassword,
        storytellerType,
        reputationLevel: 70, // Starting reputation level
        profilePicture: req.file ? req.file.path : null, // Save the profile picture path if uploaded
      });
      await user.save();

      // Remove the used verification code
      verificationCodes.delete(email);

      res.status(201).json({
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
      // If no verificationCode is provided, send a new one
      const code = generateVerificationCode();
      verificationCodes.set(email, code);
      await sendVerificationEmail(email, code);
      res.status(200).json({ message: "Verification code sent to email" });
    }
  } catch (error) {
    res.status(500).json({ error: "Error signing up", details: error.message });
  }
});

// Resend verification code
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    const code = generateVerificationCode();
    verificationCodes.set(email, code);
    await sendVerificationEmail(email, code);
    res.status(200).json({ message: "Verification code resent" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error resending code", details: error.message });
  }
});

// Login route
router.post("/login", async (req, res) => {
  try {
    const { login, username, password } = req.body;
    console.log("Received request body:", req.body);
    // Check if login is username or email
    console.log("Received Email/Username:", login || username);
    console.log("Received Password:", password);

    const user = await User.findOne({
      $or: [{ username: username || login }, { email: login || username }],
    });

    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: "Invalid password" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    res.json({ token });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Error logging in", details: error.message });
  }
});

// Google Sign-In route
const verifyGoogleIdToken = async (idToken) => {
  let retries = 3;
  while (retries > 0) {
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      return ticket.getPayload(); // Return the payload if verification succeeds
    } catch (err) {
      retries -= 1;
      if (retries === 0) throw err; // Throw error after exhausting retries
      console.error(
        `Google ID Token verification failed. Retries left: ${retries}`
      );
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait before retrying
    }
  }
};

router.post("/google-signin", async (req, res) => {
  try {
    const { idToken } = req.body;

    // Use the new verifyGoogleIdToken function
    const payload = await verifyGoogleIdToken(idToken);
    console.log("Verified Payload:", payload);

    const { name, email, sub, picture } = payload;

    let user = await User.findOne({ googleId: sub });
    if (!user) {
      // Create a new user if not found
      user = new User({
        id: new mongoose.Types.ObjectId(),
        fullName: name,
        username: email.split("@")[0], // Use part of email as username
        email,
        googleId: sub,
        storytellerType: "Listener", // Default type, can be changed later
        reputationLevel: 70,
        emailVerified: true,
        profilePicture: picture, // Use Google profile picture
      });
      await user.save();
    }

    const jwtToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    res.json({ token: jwtToken });
  } catch (error) {
    console.error("Google Sign-In Error:", error);
    res.status(500).json({
      error: "Error with Google Sign-In",
      details: error.message,
    });
  }
});

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
  const token = req.header("Authorization");
  console.log("Received token:", token); // Add this line

  if (!token) return res.status(401).json({ error: "Access denied" });

  try {
    // Remove 'Bearer ' prefix if it exists
    const tokenWithoutBearer = token.startsWith("Bearer ")
      ? token.slice(7)
      : token;
    console.log("Token without Bearer:", tokenWithoutBearer); // Add this line

    const verified = jwt.verify(tokenWithoutBearer, process.env.JWT_SECRET);
    console.log("Verified token:", verified); // Add this line

    req.userId = verified.userId;
    next();
  } catch (error) {
    console.error("Token verification error:", error); // Add this line
    res.status(400).json({ error: "Invalid token", details: error.message });
  }
};
router.get("/user", verifyToken, async (req, res) => {
  console.log("Fetching user data for userId:", req.userId); // Add this line
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) {
      console.log("User not found for userId:", req.userId); // Add this line
      return res.status(404).json({ error: "User not found" });
    }
    console.log("User data found:", user); // Add this line
    res.json(user);
  } catch (error) {
    console.error("Error fetching user data:", error); // Add this line
    res
      .status(500)
      .json({ error: "Error fetching user data", details: error.message });
  }
});

router.post("/report-user", verifyToken, async (req, res) => {
  try {
    console.log("req.userId:", req.userId);

    const { reportedUserId, reason } = req.body;
    console.log("Received report data:", { reportedUserId, reason });

    // Check if reportedUserId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(reportedUserId)) {
      return res.status(400).json({
        error: "Invalid user ID format",
        details: "The reported user's ID is not a valid Mongo ObjectId",
      });
    }

    const reportedUser = await User.findById(reportedUserId);
    console.log("reportedUser:", reportedUser);

    if (!reportedUser) {
      return res.status(404).json({
        error: "Reported user not found",
        details: `No user found with the ID: ${reportedUserId}`,
      });
    }

    const existingReport = await Report.findOne({
      reportedUser: reportedUserId,
      reportedBy: req.userId,
    });

    if (existingReport) {
      return res.status(400).json({
        error: "User already reported",
        details: "You have already reported this user.",
      });
    }

    await new Report({
      reportedUser: reportedUserId,
      reportedBy: req.userId,
      reason,
    }).save();

    const newReputation = Math.max(0, reportedUser.reputationLevel - 5);

    await User.findByIdAndUpdate(reportedUserId, {
      reputationLevel: newReputation,
    });

    res.json({
      message: "User reported successfully",
      newReputationLevel: newReputation,
    });
  } catch (error) {
    console.error("Error in report-user route:", error);

    // If it's a 'duplicate key error' from Mongo, e.g. unique index on (reportedUser, reportedBy)
    if (error.code === 11000) {
      return res.status(400).json({
        error: "User already reported",
        details: "You have already reported this user before.",
      });
    }

    // Otherwise a general error
    res.status(500).json({
      error: "Error reporting user",
      details: error.message || "An unknown error occurred.",
    });
  }
});

// Protected route example
router.get("/protected", verifyToken, (req, res) => {
  res.json({ message: "This is a protected route", userId: req.userId });
});

module.exports = { router, verifyToken };
