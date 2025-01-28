const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    console.log("Connected to MongoDB Atlas");
  } catch (err) {
    console.error("Could not connect to MongoDB Atlas", err);
    process.exit(1);
  }
};

module.exports = connectDB;
