const User = require("../models/User");
const Report = require("../models/Report");

class UserController {
  static async getUser(req, res) {
    try {
      const user = await User.findById(req.userId).select("-password");
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({
        error: "Error fetching user data",
        details: error.message,
      });
    }
  }

  static async reportUser(req, res) {
    try {
      const { reportedUserId, reason } = req.body;

      if (!mongoose.Types.ObjectId.isValid(reportedUserId)) {
        return res.status(400).json({
          error: "Invalid user ID format",
        });
      }

      const reportedUser = await User.findById(reportedUserId);
      if (!reportedUser) {
        return res.status(404).json({
          error: "Reported user not found",
        });
      }

      const existingReport = await Report.findOne({
        reportedUser: reportedUserId,
        reportedBy: req.userId,
      });

      if (existingReport) {
        return res.status(400).json({
          error: "User already reported",
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
      if (error.code === 11000) {
        return res.status(400).json({
          error: "User already reported",
          details: "You have already reported this user before.",
        });
      }

      res.status(500).json({
        error: "Error reporting user",
        details: error.message || "An unknown error occurred.",
      });
    }
  }
}

module.exports = UserController;
