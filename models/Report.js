// models/Report.js
const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reason: String,
  timestamp: { type: Date, default: Date.now },
});

reportSchema.index({ reportedUser: 1, reportedBy: 1 }, { unique: true });

module.exports = mongoose.model("Report", reportSchema);
