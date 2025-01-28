const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/authController");
const upload = require("../config/multer");

router.post("/signup", upload.single("profilePicture"), AuthController.signup);
router.post("/login", AuthController.login);
router.post("/google-signin", AuthController.googleSignIn);
router.post("/resend-verification", AuthController.resendVerification);

module.exports = router;
