const path = require("path");

module.exports = {
  appName: "Hut!",
  port: process.env.PORT || 3000,
  dbFilePath: path.join(__dirname, "..", "data", "db.json"),
  booking: {
    minServiceFee: 2500
  },
  fraud: {
    blockThreshold: 70,
    reviewThreshold: 40,
    velocityWindowMinutes: 60,
    velocityMaxCount: 3,
    highValueNaira: 700000
  }
};
