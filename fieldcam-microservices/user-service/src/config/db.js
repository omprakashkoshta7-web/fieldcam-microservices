const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) { console.error('MONGO_URI not set'); process.exit(1); }
  const conn = await mongoose.connect(uri);
  console.log(`[user-service] MongoDB: ${conn.connection.host}`);
};

module.exports = connectDB;
