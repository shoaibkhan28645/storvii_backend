const express = require("express");
const router = express.Router();
const UserController = require("../controllers/userController");
const { verifyToken } = require("../middleware/auth");

router.get("/", verifyToken, UserController.getUser);
router.post("/report", verifyToken, UserController.reportUser);

module.exports = router;
